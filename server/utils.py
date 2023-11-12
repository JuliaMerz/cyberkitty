import re

def strip_tabs(string):
    """
    Replace all tabs at the beginning of a line with an empty string.
    """

    # it's python, so tabs are 4 spaces
    comp = re.compile(r'^(\s{4})+', re.MULTILINE)
    return comp.sub('', string)

def calc_cost(prompt_tokens, completion_tokens):
    """
    Calc costs.

    Current:
    $0.01 / 1K tokens	$0.03 / 1K tokens
    """

    prompt_cost = prompt_tokens / 1000 * 0.01
    completion_cost = completion_tokens / 1000 * 0.03

    return prompt_cost + completion_cost

