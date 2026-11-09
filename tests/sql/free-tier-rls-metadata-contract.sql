-- Must run AFTER staged ALTER POLICY migration in disposable Postgres.
\set ON_ERROR_STOP on
do $$
declare missing integer; extra integer;
begin
 select count(*) into missing from (
 select * from test.baseline_policies
 except
 select schemaname,tablename,policyname,permissive,roles,cmd,
 qual is not null,with_check is not null
 from pg_policies
 where policyname<>'fixture dm reads campaigns'
 ) diffs;
 select count(*) into extra from (
 select schemaname,tablename,policyname,permissive,roles,cmd,
 qual is not null,with_check is not null
 from pg_policies where policyname<>'fixture dm reads campaigns'
 except select * from test.baseline_policies
 ) diffs;
 if missing<>0 or extra<>0
 then raise exception 'Policy structure changed: missing %, extra %',missing,extra;
 end if;
 if (select count(*) from test.baseline_policies)<>13
 then raise exception 'Expected thirteen unchanged RLS policy identities';end if;
end $$;
select 'PASS: all thirteen policy roles, commands and USING/WITH CHECK gates unchanged' result;
