-- R226 DRAFT / SOURCE-ONLY / NEVER APPLY TO ORIGINAL OR QA.
-- Forward-only relational integrity candidate, not an existing migration.
-- Generated independently from limited catalog metadata; not source SQL export.
--
-- BEFORE ANY QA INSTALL:
--   approve exact $0 QA target + backup/rollback + complete 83-file review;
--   inventory real cross-campaign rows privately, no user data export;
--   investigate existing dependent indexes, foreign keys and live consumers;
--   review runtime movement/token and DM NPC paths;
--   plan safe validation of NOT VALID constraints and lock budgets.
--
-- This first-stage candidate prevents NEW inconsistent campaign/map/character
-- references but DOES NOT validate, correct or revoke preexisting bad rows.
-- Existing RLS CREATE/UPDATE/DELETE rules are not changed by this file.
BEGIN;

-- Necessary unique reference key; known primary key id is already unique,
-- but PostgreSQL needs a matching unique key for a two-column foreign key.
-- This may require a table lock/scan on real data: QA ONLY after review.
ALTER TABLE public.characters
 ADD CONSTRAINT characters_campaign_id_id_r226_key UNIQUE(campaign_id,id);

-- Composite map binding; preserves ON DELETE CASCADE behavior conceptually
-- but needs trigger/dependency review against the original map-id FK.
ALTER TABLE public.map_tokens
 ADD CONSTRAINT map_tokens_campaign_map_r226_fk
 FOREIGN KEY (campaign_id,map_id)
 REFERENCES public.battle_maps(campaign_id,id)
 ON DELETE CASCADE
 NOT VALID;

-- Character optional for NPC tokens. On character deletion only character_id
-- becomes NULL; campaign_id MUST remain intact. PostgreSQL 17 syntax.
ALTER TABLE public.map_tokens
 ADD CONSTRAINT map_tokens_campaign_character_r226_fk
 FOREIGN KEY (campaign_id,character_id)
 REFERENCES public.characters(campaign_id,id)
 ON DELETE SET NULL (character_id)
 NOT VALID;

-- Fail closed if new inserts/updates are not covered by both constraints.
DO $r226_verify$
BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_constraint
      WHERE conrelid='public.map_tokens'::regclass
        AND conname IN ('map_tokens_campaign_map_r226_fk',
                        'map_tokens_campaign_character_r226_fk')
        AND contype='f' AND NOT convalidated)<>2 THEN
   RAISE EXCEPTION 'R226_EXPECTED_NEW_UNVALIDATED_FK_MISSING'
     USING ERRCODE='23514';
 END IF;
END
$r226_verify$;

COMMIT;

-- Deliberately NO VALIDATE CONSTRAINT here.
-- This candidate is NOT release-ready without historical row validation,
-- remediation of any affected data, and a separately owner-authorized QA run.
