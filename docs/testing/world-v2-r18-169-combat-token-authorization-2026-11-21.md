# B10-R18-169 — Combat, token quick edits, NPC read and map publisher privilege review

21 November 2026. Exact source-only child of [R18-168 PR #277](https://github.com/xuvenz-source/ttrpgsite/pull/277) at `ee219e79d34743223c1e2b5834c5c736a0326dab`. **NO_GO.** R168 dedicated guard passed; broad staging-only PG verification was in progress while this package was prepared.

## Read-only original `pg_proc` semantic triage

Fourteen authenticated-callable public SECURITY DEFINER functions were inspected transiently. Full source remains in the original database and is not exported to Git/chat/CI. The manifest pins name, identity arguments, source MD5/bytes and sanitized control-flow evidence.

The group includes map-combat begin/command/token insertion/initiative, two DM NPC getters, player and DM token quick-edit/read functions, party map movement, environment publication and token-reference chat posting.

- All **14** have authenticated EXECUTE and deny anon EXECUTE. **11** directly mention `auth.uid()`; the other **3** (`get_dm_map_npc_values`, `get_npc_token_values`, `publish_map_environment`) delegate actor authorization to `is_campaign_dm`. The helper checks current signed DM campaign membership in live source, but only signed QA can prove the complete exposed call chains.
- **Nine** of these functions contain an apparent top-level DML statement. Each has at least one recognized server-side authorization helper call before the first such statement in its source. This rules out the most superficial unguarded mutation shape, but **does not prove** correct authorization of all branches, ownership, JSON payloads or cross-campaign references.
- `roll_map_combat_initiative` and token quick values can allow authorized players as well as DMs. Do not apply a blanket DM-only classification to these operations; test the actual owner/observer/DM contract.
- DM map publisher mutations can affect fog and environment state. Revocation of Realtime subscribers and already issued signed asset URLs is separate from a correctly guarded publisher function.

## Signed-account QA gate

Fourteen positive/negative cases remain `NOT_RUN` in `staging/world-v2-b10-r18-169-combat-token-rpc-audit/manifest.json`, covering DM, active P1/P2, revoked P1 and outsiders, including combat command, initiative, quick edits, NPC data, cross-campaign IDs, environment publication and token reference chat. No fixture here executes actual original private function SQL or provides signed sessions.

Existing verified issues #220 revoked character sheet, #212 fog-status privacy, #223 old invite rejoin, #229 privileged membership mutation, #231 issued URL/Realtime and #218 inventory UUID churn remain unresolved. R18-166 private default-execute hardening is tracked separately as issue #275, not an observed current exploit.

## Engineering decision

This step improves the actual 67-RPC review inventory with 14 further source paths but **does not** mark 14 as fully semantically or hosted-authorized PASS. All remaining 83 historical SQL dependencies, R127 release gate and signed QA remain blocked. No root SQL migrations or application runtime changes, no original/QA writes, no merge/deploy/paid infrastructure.

The AI lead continues as sole technical reviewer; no other person is required to perform this source review. Owner approval is separately required for hosted QA schema setup and final production release.
