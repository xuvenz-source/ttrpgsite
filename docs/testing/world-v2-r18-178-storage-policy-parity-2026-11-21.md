# B10-R18-178 — Private Storage policy/path parity and fail-closed NPC image test

21 November 2026. Exact child of R18-177 [draft PR #286](https://github.com/xuvenz-source/ttrpgsite/pull/286) at c51ca2d792d92557354256117cbe8b1969777e69. **NO_GO, source-only**. R177's dedicated tests and standard verification passed before R178 was prepared; its longer combined scratch PostgreSQL test was in progress when branched.

## A substantive integration mismatch discovered

The original private storage.objects SELECT predicate for tabletop-artwork was inspected **in place** in original Supabase. Its read-only MD5 is affe04714d6ba424c9ae80f9e28b865c / 610 bytes. It references:
- public.map_tokens.image_path and can_observe_map_token
- public.characters.portrait_path and token_path under member/DM/owner conditions
- **not** the npc_templates table or an explicit NPC-template portrait path branch.

R176's adapter can resolve a DM-visible NPC template portrait from npc_templates.portrait_path, but the real user-JWT-scoped Storage download may not permit that file solely on the template relationship. The R176 mock was too broad in that one test. The omission is **not proof of a current vulnerability or a conclusive live 403**; some objects could be reachable if the same path is also attached to another RLS-authorized map token or character. Only signed QA can settle actual behavior.

## Strict corrective integration behavior

Six additional synthetic tests compose the actual R175 HTTP gateway and R176 resource resolver with a mock Storage policy deliberately limited to the observed source-bound paths. A DM's NPC token image linked to map_tokens.image_path succeeds, while an NPC template portrait without another authorized object relationship is denied by Storage RLS and returns the fail-closed HTTP error. Character portrait (owner/DM), authorized maps, personal owner images and removal denials remain available under their respective synthetic conditions. **No service-role fallback, unrestricted object key fetch or broader policy is permitted just to make a portrait show.**

The correct future solution depends on product requirements:
- If NPC portrait visibility is intended only for the DM, prepare and independently review a *narrowly bound* current-DM campaign + npc_template ID/path Storage SELECT policy as a forward-only candidate after historical review.
- If only observed token art is needed, reuse the authorized map_tokens.image_path route without changing Storage ACLs.

Do not presume the $0 plan has Pro-only CDN purge; do not touch existing issued signed links, active app, hosted Storage, migrations or QA yet. Signed DM/P1/P2/revoked testing remains NOT_RUN; #220/#212/#223/#229/#231/#218 and 83/67 semantic gates remain NO_GO.
