import backoff
import openai
from openai import OpenAI
from server.models import User, Query, ApiCall
from server.utils import calc_cost
from server.config import get_settings

conf = get_settings()

client = OpenAI(api_key=conf.OPENAI_API_KEY)


CONTINUE_PROMPT = "Your last message got cutoff, without repeating yourself, please continue writing exactly where you left off."

MAX_RETRIES = 3
QUERY_MAX_TOKENS = None
QUERY_TEMPERATURE = 1.0
QUERY_FREQUENCY_PENALTY = 0.1


@backoff.on_exception(backoff.expo, [openai.RateLimitError, openai.APITimeoutError])
def completions_with_backoff(**kwargs):
    return client.chat.completions.create(**kwargs)


def query_executor(system_prompt: str, prompt: str, user: User | None, previous_messages: list[dict] = []):
    """
    Execute a query against the openai API.

    Side Effects:
    Generates a Query objects and associated ApiCall objects and saves them to the database.
    """

    messages = [
        {"role": "system", "content": system_prompt},
    ]
    for message in previous_messages:
        messages.append({"role": "user", "content": message[0]})
        messages.append({"role": "assistant", "content": message[1]})
    messages.append({"role": "user", "content": prompt})

    complete_output = ""
    retry_count = 0

    query = Query(user=user, prompt=prompt, system_prompt=system_prompt,
                  previous_messages=previous_messages, response=complete_output)

    # $0.01 / 1K tokens	$0.03 / 1K tokens

    while True:
        try:
            response = completions_with_backoff(model="gpt-4-1106-preview",
                                                prompt=prompt,
                                                max_tokens=QUERY_MAX_TOKENS,
                                                temperature=QUERY_TEMPERATURE,
                                                frequency_penalty=QUERY_FREQUENCY_PENALTY,
                                                tool_choice=None)

            choice = response.choices[0]

            call_cost = None
            if response.usage:
                call_cost = calc_cost(
                    response.usage.prompt_tokens, response.usage.completion_tokens)

            api_call = ApiCall(query=query, success=True, cost=cost,
                               input_messages=messages, output=choice.message)
            query.api_calls.append(api_call)

            if choice.message.content:
                complete_output += choice.message.content
                query.response = complete_output

            # CONTINUE CASE
            if choice.finish_reason == "length":
                new_message = {"role": "assistant", "content": choice.message}
                messages.append(new_message)
                messages.append({"role": "user", "content": CONTINUE_PROMPT})

                retry_count = 0
                continue
            # SUCCESS CASE
            elif choice.finish_reason == "stop":
                new_message = {"role": "assistant", "content": choice.message}
                messages.append(new_message)
                break

            # ERROR CASES
            elif choice.finish_reason == "content_filter":
                print("Content Filtering ERROR: " + choice.finish_reason)
                api_call.success = False
                api_call.error = "content_filter"

                retry_count += 1

                if retry_count > MAX_RETRIES:
                    break
                continue
            else:
                # other error case
                print("Unknown ERROR: " + choice.finish_reason)
                api_call.success = False
                api_call.error = "unknown"

                retry_count += 1

                if retry_count > MAX_RETRIES:
                    break
                break

        except openai.APIError as e:
            print(e)
            retry_count += 1
            if retry_count > MAX_RETRIES:
                break

            continue

    query.all_messages = messages
    query.save()

    return query
