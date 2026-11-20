# B10-R18-132 — Transaction-locked V3 scene publishing and legacy socket boundary

**20 November 2026, Australia/Melbourne.** Direct source-only child of draft PR #239 pinned at `0741b11e59b151321129a7a3e9d33bb541c29db4`. **Production NO-GO.** No hosted SQL, new versioned migration, `src/` edit, frontend deployment, original/QA mutation, merge or paid infrastructure.

## Confirmed inherited source of truth

R18-131's exact final source, standard repository build/security and combined staging-only PostgreSQL integration passed. R123 access sentinel and quarantine, R125 epoch storage, R126 recipient fanout, R127 release recorder, R128 public API freeze, R129 metadata fix and this R132 sender are **staged only**; none is a live hard fence. The original Supabase has 83 migrations and the V2 scene receive policy remains. QA has no application tables or migrations. No real signed DM/P1/P2/outsider Realtime tests have been completed.

The live original app still joins `forge-world-scene-v2:<map>`; its original `forge_world_v2.bump_scene_publication_v2(uuid)` is an old map-wide publisher. Dropping its RLS receiver policy does **not** evict already-connected V2 subscribers, because Realtime private Broadcast permission is calculated when joining. Do not confuse a successful new-join denial with a server-delivery cutoff. See [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization).

## Narrow engineering candidate — scene publisher, not global system fence

The UNAPPLIED `staging/world-v2-b10-r18-132-scene-publisher-drain/unapplied-scene-publication-drain.sql` is executable ONLY in a disposable PG17 database **after the R125 and R126 synthetic candidate SQL in order**. It adds a private `forge_scene_drain.scene_publication_gate` table with exactly one mode row and a CHECK that permits only `fenced` or `v3-only`. The mode **defaults to fenced**. Neither `anon` nor `authenticated` gets schema usage, table privileges, or function EXECUTE. No `v2` mode, caller-controlled version flag, public unseal RPC or rollback to shared publishing exists.

The private `scene_v3_publish_allowed()` predicate reads the mode using **SELECT ... FOR SHARE**. When the existing scene publisher is replaced by this candidate it calls that predicate before any scene update or send. The row lock is held until the publisher transaction commits. An independent maintenance UPDATE to `fenced` must wait until all already-running guarded transactions release their share locks. Once the maintenance UPDATE commits, a **new invocation of this single guarded publisher** cannot emit a V3 notice.

The replacement preserves `bigint` generation semantics and the `scene_publications` persisted counter even while fenced. With `v3-only`, it sends to `forge_scene_revoke.current_recipient_scene_topic_v3(map,user)` only, which requires a current R125 epoch, campaign membership and proper map assignment, with membership FOR SHARE. Sending never falls back to a map-wide V2 topic. A failed Realtime send only skips that recipient's notification; the persistently bumped generation remains available for an authenticated V3 resync.

**This is NOT ready to deploy.** The source-only demonstration does not implement a safe production unseal operation. A trusted superuser could still write the table or call `realtime.send` directly; a compromised service_role/Edge sender remains outside this circuit. There are **seven** observed database-side SQL emitter functions; this R132 SQL controls **one** prospective candidate and leaves the other **six** unguarded. `sender-coverage.json` records their names and original function MD5s. The R126 original staged publisher is not automatically guarded unless **this additional R132 replacement** is reviewed and installed in the correct release sequence. The original live V2 publisher is unchanged.

## Synthetic PostgreSQL 17 security evidence

The independent disposable PG17 job installs R125 synthetic members, a synthetic `realtime.send` message log, R125 source-only epoch SQL, R126 source-only recipient policy/publisher SQL, then R132 candidate. The test asserts:

1. Default `fenced` mode advances scene generation but emits no private or shared message.
2. A **trusted test-only** UPDATE to `v3-only` allows only legitimate P1/P2/DM recipient V3 epochs, no V2 fallback or outsider.
3. After P1 membership DELETE, the sender stops targeting the removed P1 while still serving DM and P2, and generation remains monotonic.
4. Switching back to `fenced` preserves generation without additional sends; already queued synthetic messages remain present and therefore are not claimed to have been erased from old sockets.
5. Restoring P1 membership creates a new R125 epoch; an earlier V3 topic fails its fresh RLS evaluation.
6. `anon` and `authenticated` cannot inspect the private gate. Attempts to enable `v2` mode fail its CHECK constraint.
7. **Concurrent transaction test:** an open publisher's `FOR SHARE` lock prevents a concurrent UPDATE from committing; a short `lock_timeout` sees the expected lock error. After the publisher commits, the fence can close. This proves transaction ordering for the isolated schema only.
8. **Intentional negative control:** a trusted direct `realtime.send` can still produce a V2 map-wide message while the gate is fenced. This is **not** a feature; it proves an unguarded emitter bypass remains and is a blocking deficiency.

The mock `realtime.messages` table is only a test log, NOT Supabase's network service. Nothing in these tests proves actual WebSocket socket ejection, network-delivery timing, service_role revocation, per-message subscription ACL behavior or end-to-end trusted actor authorization.

## Mandatory next integration work and release gate

**R18-133 should audit and gate the remaining six direct SQL senders, all external/client Broadcast senders, and the 17 Postgres Changes tables, then prove both old and new channels with actual signed users.** The historical 67 public privileged RPC chains and 83 original private migrations require final review. The release must coordinate R123 synchronous unmount, R128 server read/write hard fence, R125/R126 recipient V3 transport, and R127 maintenance-first approval with no shared V2 rollback. It must ensure old V2 clients cannot obtain fresh protected data through alternate RPC/Storage paths.

Supabase's [2026 Realtime schema restrictions](https://supabase.com/changelog/realtime-schema-locked-down-against-modification) forbid modifying Realtime-owned objects except permitted policies on `realtime.messages`; do not attempt to patch `realtime.subscription` or the provider's WebSocket internals. External signed artwork URLs already issued for up to 3,600 seconds remain valid without an independent #231 fix. Genuine on-host concurrency, bandwidth, fanout, motion/collision/fog latency and $0 plan checks are necessary before a human can approve any future cutover.

Open issues #220, #223, #229 and #231 remain. **No manual work is required now. No production or hosted QA work was done. The release decision is NO-GO.**
