# The Infinite Library
The infinite library is an experiment on the future of literature in a world of ubiquitous AI.
It was inspired by my secondary craft—writing niche queer literature—and my frustration that
there wasn't more of it available. In a world where words are cheap but ideas are precious,
can we make high quality content easier to produce and discover? In the same way programmers
no longer write in assembly, can we produce higher level programming for writers?

Can we elevate writers instead of replacing them?

## Internals

The infinite library consists of two primary components: a book creator/editor built on top
of a multi phase GPT-4 algorithm, and a curation/librarian algorithm that makes these books
publicly available.

##  FAQ
### Why don't you allow writers to edit the final text?
I want to add that in v2, I just need something resembling content filtering first, to avoid
things like injection attacks.

### If we're uplifting writers, what about monetization?
Honestly if I was building spotify for books I would need more than just a single week of
having the flu. But yes, that's probably a good idea. That said, I'm a big believer in
patreon, which is why after writing this FAQ answer I decided to make authors more prominent
and add patreon links.





# Development

```
pydantic2ts --module server/main.py --output frontend/src/apiTypes.ts --json2ts-cmd "yarn json2ts" --exclude ApiCallBase --exclude QueryBase --exclude StoryBase --exclude StoryOutlineBase --exclude ChapterOutlineBase --exclude SceneOutlineBase --exclude SceneBase --exclude BaseSettings --exclude Settings --exclude BaseSQLModel --exclude SQLModel
```
