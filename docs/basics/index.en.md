# Web Fundamentals — Start here

This track is **optional**. It exists for people who already program — in Python,
Java, C#, Go, whatever — but never had to learn **the web platform**: HTML, CSS,
the JavaScript that runs in the browser, and the minimum TypeScript and React that
`tempest-react-sdk` assumes on every page.

The [Tutorial](../tutorial/index.md) starts at `create-tempest-app` and already
assumes you know what a component, a hook, an ES module and a type are. If that
reads like a list of words, **start here**. If it reads as obvious, skip straight
to the tutorial — nothing in this track is a prerequisite for it. 🚀

## The express path

You do not need to read all eleven pages. Each one opens with a
**"Skip this page if you already know…"** block, and the table below is the
shortcut: find the symptom, go to the page.

| If you have seen this happen…                                     | Read                                         |
| ----------------------------------------------------------------- | -------------------------------------------- |
| "I added `!important` until the flicker stopped"                  | [Cascade and specificity](css.md)            |
| "I changed the colour on `:root` and it did not apply everywhere" | [Custom properties and theming](css-variables.md) |
| "The layout breaks when the text is long"                         | [Box, flow, flex and grid](css-layout.md)    |
| "My `useEffect` runs in an infinite loop"                         | [Value, reference, scope](js.md)             |
| "`console.log` shows the data but the screen shows nothing"       | [Promise, await, fetch](js-async.md)         |
| "I imported one thing and the bundle grew by 8 KB"                | [Modules, npm and the bundler](js-modules.md) |
| "TypeScript complains about a type I never wrote"                 | [The minimum the SDK uses](typescript.md)    |
| "The screen reader does not announce the field"                   | [Forms and accessibility](html-forms.md)     |

## How each page is built

They all follow the same shape as the rest of this site:

1. **Skip if you already know** — the exact list of what the page covers.
2. **The problem** — the real bug that shows up when the concept is missing.
3. **A complete example** — a whole file, copy-pasteable, that runs. Never a
   fragment with `...`.
4. **Piece by piece** — the *why*, not only the *how*.
5. **Where it shows up in the SDK** — the anchor that ties the concept to code you
   already have in front of you.
6. **Recap** — the page in five lines.

!!! info "This track does not replace MDN"

    [MDN Web Docs](https://developer.mozilla.org/) is the dictionary of the web
    platform, and every page here links the canonical reference. What this track
    offers is the **order**: what to learn first, and why it matters for the app
    you have in front of you.

!!! note "What is out of scope"

    Programming logic, algorithms and data structures. The target is someone who
    **already programs** and does not know the web platform — not someone learning
    to program.

## The eleven pages

### How the page exists

| Page                                             | You walk away knowing                                            |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| [HTML: structure and semantics](html.md)         | Why the tag you pick changes behaviour, not just appearance      |
| [Forms and accessibility](html-forms.md)         | `<label>`, `for`/`id`, and why `aria-label` is the last resort   |

### How the page looks

| Page                                                | You walk away knowing                                        |
| --------------------------------------------------- | ------------------------------------------------------------ |
| [CSS: selectors, cascade, specificity](css.md)      | Who wins over whom, and why `!important` is debt             |
| [Box, flow, flex and grid](css-layout.md)           | Why an element has that size, and how layout responds        |
| [Custom properties and theming](css-variables.md)   | How `--tempest-*` inherits — the entire theming strategy     |

### How the page reacts

| Page                                              | You walk away knowing                                          |
| ------------------------------------------------- | -------------------------------------------------------------- |
| [JavaScript: value, reference, scope](js.md)      | Why an inline object breaks memoisation                        |
| [Async: promise, await, fetch](js-async.md)       | Why data "disappears", and what an empty successful response is |
| [Modules, npm and the bundler](js-modules.md)     | What an `import` costs, and what tree-shaking charges          |

### Before the tutorial

| Page                                                | You walk away knowing                                  |
| --------------------------------------------------- | ------------------------------------------------------ |
| [TypeScript: the minimum the SDK uses](typescript.md) | Reading a public export signature without stalling    |
| [React: component, state, effect](react.md)         | The mental model the Tutorial assumes from page one    |

## Recap

- The track is **optional** and no page in it is a prerequisite for the
  [Tutorial](../tutorial/index.md). ✅
- Use the **symptom table** above if you only want to close one specific gap.
- Every page teaches **the concept** and ends by showing **where it is already
  working** in the SDK.
- None of this is about programming logic — it is about the web platform.

➡️ **Next page:** [HTML: structure and semantics](html.md)
