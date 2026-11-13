import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// Public Git commit hash only; NEVER inject credentials or other env values.
// Vercel exposes the source SHA only if system variables are enabled.
// A missing SHA is intentionally NOT guessed: QA users may type the verified
// deployed SHA that the operator independently checked.
const buildSha=[process.env.VERCEL_GIT_COMMIT_SHA,process.env.GITHUB_SHA]
 .find(x=>typeof x==='string'&&/^[0-9a-f]{40}$/i.test(x))?.toLowerCase()||'';
export default defineConfig({
 plugins:[react()],
 define:{'import.meta.env.VITE_WORLD_V2_QA_BUILD_SHA':JSON.stringify(buildSha)}
});