"""R225 live-source signing callsite tests use invented checkout files only."""
from __future__ import annotations
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location(
    "r225_source_signer",ROOT/"scripts/release/r225_live_signed_asset_issuance_gate.py"
)
audit=importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

SIGNER="""export function makeStore(db,bucket,path){
 return db.storage.from(bucket).createSignedUrl(path,3600)
}
"""
APP="""import {signedAssetStore} from './SignedAssetUrls.js';
function refreshSession(){signedAssetStore.clear();signedAssetStore.clear();}
function showMap(){signedAssetStore.subscribe(db,'fake','path',()=>{})}
"""
ART="""import {signedAssetStore} from './SignedAssetUrls.js';
const a=signedAssetStore.peek(db,'fake','a');
const b=signedAssetStore.peek(db,'fake','b');
signedAssetStore.subscribe(db,'fake','a',()=>{});
"""

def setup(folder):
 root=Path(folder)
 (root/"src").mkdir()
 (root/"supabase/functions/mock").mkdir(parents=True)
 (root/"src/SignedAssetUrls.js").write_text(SIGNER)
 (root/"src/TabletopApp.jsx").write_text(APP)
 (root/"src/Artwork.jsx").write_text(ART)
 (root/"supabase/functions/mock/index.ts").write_text(
    "export const handler = async()=>({ok:true});"
 )
 return root

class ScannerTests(unittest.TestCase):
 def test_exact_fictional_baseline_is_no_go_and_never_authorizes_install(self):
  with tempfile.TemporaryDirectory() as tmp:
   r=audit.report(setup(tmp))
   self.assertEqual(r["decision"],"NO_GO")
   self.assertTrue(r["reviewed_exact_callsite_baseline_unchanged"])
   self.assertEqual(r["direct_create_signed_url_call_count"],1)
   self.assertEqual(r["get_public_url_call_count"],0)
   self.assertEqual(r["legacy_auth_transition_cache_clear_calls"],2)
   self.assertEqual(r["shared_store_subscription_call_count"],2)
   self.assertEqual(r["source_js_ts_files_scanned"],4)
   self.assertFalse(r["qa_sql_install_authorized"])
   self.assertFalse(r["semantic_access_and_server_signed_url_revocation_verified"])

 def test_second_signer_in_arbitrary_runtime_file_is_refused(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=setup(tmp)
   (root/"src/Unsafe.jsx").write_text(
      "const x = db.storage.from('x').createSignedUrl(path, 3600)"
   )
   with self.assertRaises(audit.Blocked): audit.report(root)

 def test_multiple_signer_calls_even_in_allowed_file_are_refused(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=setup(tmp)
   f=root/"src/SignedAssetUrls.js"
   f.write_text(f.read_text()+"\ncreateSignedUrl(another,3600);")
   with self.assertRaises(audit.Blocked): audit.report(root)

 def test_new_public_url_export_from_edge_function_is_refused(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=setup(tmp)
   f=root/"supabase/functions/mock/index.ts"
   f.write_text("client.storage.from('fake').getPublicUrl(path)")
   with self.assertRaises(audit.Blocked):audit.report(root)

 def test_changed_signer_ttl_is_refused(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=setup(tmp)
   f=root/"src/SignedAssetUrls.js"
   f.write_text(f.read_text().replace("path,3600","path,360"))
   with self.assertRaises(audit.Blocked):audit.report(root)

 def test_changed_legacy_clear_caller_is_refused(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=setup(tmp)
   f=root/"src/TabletopApp.jsx"
   f.write_text(f.read_text()+"\nfunction revoke(){signedAssetStore.clear()}")
   with self.assertRaises(audit.Blocked):audit.report(root)

 def test_missing_required_source_and_symlink_are_refused(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=setup(tmp)
   (root/"src/SignedAssetUrls.js").unlink()
   with self.assertRaises(audit.Blocked):audit.report(root)
  with tempfile.TemporaryDirectory() as tmp:
   root=setup(tmp)
   (root/"src/Alias.js").symlink_to(root/"src/Artwork.jsx")
   with self.assertRaises(audit.Blocked):audit.report(root)

 def test_unexpected_nested_runtime_signer_is_refused(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=setup(tmp)
   (root/"src/engine").mkdir()
   (root/"src/engine/v2.ts").write_text(
      "export const sign=db=>db.storage.from('a').createSignedUrls(['private']);"
   )
   with self.assertRaises(audit.Blocked):audit.report(root)

if __name__=="__main__": unittest.main()
