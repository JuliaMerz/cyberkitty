![cyberkitty](./cyberkitty-nb-small.png)
# CyberKitty
CyberKitty is an experiment on the future of literature in a world of ubiquitous AI.
It was inspired by my secondary craft—writing niche queer literature—and my frustration that
there wasn't more of it available. In a world where words are cheap but ideas are precious,
can we make high quality content easier to produce and discover? In the same way programmers
no longer write in assembly, can we produce higher level programming for writers?

Can we elevate writers instead of replacing them?

CyberKitty is an experimental human+ai hybrid novel editor that seeks to answer the question
"what does the human creation of literature look like in a world of ubiquitous AI".

It's also an experiment in using GPT on long form texts, and the techniques it uses are broadly
applicable to other long form text use cases.

## Usage
You can use cyberkitty in one of two ways: You can git clone this repo, pipenv install,
yarn install, and go, or you can use a hosted version at [cyberkitty.ink](https://cyberkitty.ink).
The hosted version will give you $1 worth of free tokens on signup, then ask you to pay.
At the moment generating large amounts of text is still not cheap, so I'm unable to provide
a publicly accessible unlimited version.

If you run it locally, the dev version autologins a dev user which uses API keys provided
by the .env file.

## Techniques
CyberKitty does a couple of things under the hood to make all of this possible.

### Tree Generation
CyberKitty internally stores novels as a multi-level tree. In order to handle context limitations
and limit token cost, it limits its generation inputs to the node being generated, it's previous
sibling, and its parent nodes. By excluding aunts/uncles and cousins, we constrain costs and
kep GPT focused.

GPT also seems pretty tuned on responses of a certain length, so we choose the number layers
based on the eventual target output length. For a full length novel, experimental testing
suggested that around five layers is appropriate.

### Context Lists
This is pretty well understood, but by having it generate lists of themes and plotlins and other
important information and feeding them back during generation, we can keep GPT significantly
more focused than it woudl be otherwise.

### Iterative Generation + Self Editing
One weakness of LLM's "reasoning" capabilities is that they are only retroactive. They
can say "x and y happened earlier, so z happened now" They cannot say "z will happen in the future
so y needs to happen now". One way of getting around this is to iteratively generate, which effectively
moves the entire text into the past.

We can build on this by asking it to make edits and by asking it to set intentions and make notes
about its editing. Its desire to fulfill the request for "improvement notes" forces it to come up with ideas,
and those ideas being at the top of its generated output mean that when it's doing revisions it's constantly
trying to fulfill the edit requests.

### Prompt Engineering/Imitation
By default GPT produces work that is the rough average of its inputs, applicable to its current output.
We get about a 20% improvement in writing quality by modifying its system prompt to include "you are an author
that writes tight, high quality prose." There's similar small adjustments like this sprinkled throughout
the underlying prompt engineering, including specific nudges for creating dialogue or writing in a non-summarizing
perspective. Check out `prompt_generator.py` for a full rundown of the prompting algorithm.

![forward editing](./forward_edits.png)

### Human Interface
Surprisingly, the harder step from here is making the *human* part of this tractable. AI
can generate a novel draft in 10-20 minutes. The last time I planned a full novel it took me
200 sticky notes and three days. Then many more days iterating as I wrote the novel.

*Editing* a 35k word novella (that's half a full novel) that I'd personally written took 2-3 weeks.
This is *normal* in the writing industry, but it means that efficiency gains can only really come
if we make it easy for the human brain to internalize and work with the novel.

CyberKitty achieves this with a combination of collapsible rendering and a maximally intuitive editing interface. Just
click to edit, unclick to autosave, and you can think about the next component. It also warns you
when you've edited something that would normally be an input to AI generation, so you can decide
if you want to rerender. (it does not yet keep you from rerendering over your own work, coming soon!)

## Expectations/Outcomes
The hardest part of working on this for me was not setting my own bar at "AI creates infinite books."
Can GPT generate a full work of fiction? yes. Try it in the editor. It requires 500k or so tokens, 20ish bucks,
 and like every other current (Nov '23) GPT application it will produce mid-range prose, acceptable concepts,
and occasional word soup.

Prompting techniques get us closer to the state of the art, but fundamentally these things will improve
as AI models improve as AI models improve. A reasonalbe goal then, is
to eliminate the quality loss experienced when asking GPT
to work in a longer context window, and from that perspective CyberKitty gets pretty close. The
rest will continue to improve as GPT does.

# Development

```
pydantic2ts --module server/main.py --output frontend/src/apiTypes.ts --json2ts-cmd "yarn json2ts" --exclude ApiCallBase --exclude QueryBase --exclude StoryBase --exclude StoryOutlineBase --exclude ChapterOutlineBase --exclude SceneOutlineBase --exclude SceneBase --exclude BaseSettings --exclude Settings --exclude BaseSQLModel --exclude SQLModel
```
