# MARKET MAYHEM online

Vercel hosts the game and two API functions. Supabase holds the players, scores and god-mode settings.
Everything runs on free tiers.

```
public/index.html    the game (built from the main project)
public/admin.html    Market God admin panel  →  yoursite.vercel.app/admin
api/game.js          players: sign in, ranked weekly runs, leaderboard, offices, follows
api/admin.js         admin: bans, volatility, luck, cash, crashes/booms, announcements
api/_lib/            shared code + a copy of the game engine (used to replay and verify scores)
supabase/schema.sql  database tables (run once)
```

## 1. Create the database (Supabase, about 5 minutes)
1. Sign up at supabase.com, then **New project**. Pick the London region, set a database password and keep it somewhere safe.
2. Open **SQL Editor**, then **New query**. Paste all of `supabase/schema.sql` and press **Run**.
3. Go to **Project Settings > API** and copy two values:
   - **Project URL** (looks like `https://abcd.supabase.co`)
   - **service_role** secret key. This key can do anything, so never put it in the game or share it.

## 2. Put it online (Vercel, about 5 minutes)
Pick **A** or **B**.

**A. GitHub (best: every push redeploys automatically)**
1. Create a new private GitHub repo and upload the contents of this folder.
2. In vercel.com, go to **Add New > Project** and import the repo. Framework: **Other**. Leave the build settings empty.

**B. Vercel CLI (no GitHub needed)**
```
npm i -g vercel
cd market-mayhem-online
vercel          # first time: log in and create the project
vercel --prod
```

## 3. Add the secrets (Vercel > Project > Settings > Environment Variables)
| Name | Value |
|---|---|
| `SUPABASE_URL` | the Project URL from step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key from step 1 (mark it **Sensitive**) |
| `SESSION_SECRET` | any random string of 32+ characters. Make one with `openssl rand -hex 32` |
| `ADMIN_PASSWORD` | your Market God password, 10+ characters (mark it **Sensitive**) |

Then go to **Deployments** and **Redeploy** so the new values take effect.

## 4. Check it works
- Open `https://<your-project>.vercel.app`. The Menu should now show **Sign in or create an account**.
- Open `/admin` and enter your ADMIN_PASSWORD.
- Create a test account, start the ranked weekly challenge, and check that you appear in the admin panel.

## How scores stay honest
Each weekly run is the same seeded market for everyone, plus whatever your god-mode settings add. The game
records every action with the tick it happened on. When the run ends, the server **replays the whole run** and
only accepts the score if it matches. Edited scores, edited logs, or dropping a god-mode nerf all fail the check.
A run where the player reloaded an old save is marked **suspect** in the admin panel.

## God mode notes
- Volatility, luck and cash reach a player at their next game day (the game checks in once per game day).
- Crashes, booms and announcements go to everyone, or to one chosen player. Pick "as soon as possible" or a game day.
- Runs you changed are marked **rigged** in the admin panel. Players never see this.
- The settings are sent to the game in a lightly scrambled form. A tech-savvy player who inspects the network
  traffic could decode their own settings, but cannot change them without their score being rejected.

## Updating the game
In the main project, run `node scripts/build-web.js`. Then redeploy this folder (push to GitHub, or run `vercel --prod`).

## Local testing (no Supabase needed)
`npm install` then `ADMIN_PASSWORD=localtest123 node tools/dev-web.js` opens a local copy that uses
in-memory data.
