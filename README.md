# Tabletop Forge

A free-tier virtual tabletop prototype using React, Vite, Vercel and Supabase.

Features: campaign invites, custom sheet template tabs and fields, player sheets, inventory lists, chat with `/roll`, DM map folders, map uploads and saved grid tokens.

## Setup

Supabase migrations are installed in the connected TTRPG Site project. Configure Vercel with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (only a public publishable key, never a service-role key). Supabase Auth URL configuration should use your Vercel site URL.

Run `npm install && npm run dev` locally. This is a prototype; do not use it with sensitive data or expose to untrusted groups without further testing. Dynamic lighting, advanced Roll20 macros and fog of war are not yet implemented.
