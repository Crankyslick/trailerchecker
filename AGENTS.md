<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## QuickBooks Online
- QBO token lifecycle and Intuit API calls live only in `src/lib/qbo/*.server.ts`; `src/lib/qbo.functions.ts` is the sole client-reachable surface, so service-role credentials never enter the browser bundle.
