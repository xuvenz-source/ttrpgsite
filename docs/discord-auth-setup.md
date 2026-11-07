# Discord sign-in setup (outside the staged code)

The production login offers `signInWithOAuth({ provider: 'discord' })`, but the provider
configuration is an independent Supabase Auth setting. A tester reporting
`{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}`
is rejected before the Discord OAuth flow is completed.

**Administrator steps (never commit Client Secret to GitHub):**
1. Open https://discord.com/developers/applications and create a Discord application.
2. In Discord OAuth2 settings, add this redirect URI:
   `https://lwhwgqaunxbmvyndswze.supabase.co/auth/v1/callback`.
3. Copy its **Client ID** and **Client Secret** into Supabase project
   `lwhwgqaunxbmvyndswze` → Authentication → Sign In / Providers → Discord, enable it and Save.
4. In Supabase Auth URL Configuration, use `https://ttrpgsite.vercel.app` as Site URL
   and allow `https://ttrpgsite.vercel.app/**` as a redirect URL.
5. Confirm a new account can sign in with Discord, return to the campaign hub,
   and join a campaign. Existing username/password accounts are independent unless linked.

The UI fix in this staged batch turns Supabase's raw 400 response into a useful
error for testers while the provider has not been configured. It **does not**
enable Discord or publish code. Username/password account creation remains available.

Sources: https://supabase.com/docs/guides/auth/social-sign-in/auth-discord
https://supabase.com/docs/guides/auth/redirect-urls
