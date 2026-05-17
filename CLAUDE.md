# Decks Unique Estimator App — Claude Code Project Memory
## Who I am
Jay Colapinto — owner/salesman at Decks Unique, a deck building company on Long Island, NY. I use Claude Code to build and maintain this app.
## Project Overview
Deck estimating app used by Jay and Lou (business partner) to create customer estimates and proposals.
## Tech Stack
- Frontend: React/TypeScript
- Database: Supabase
- Hosting: Cloudflare Pages (auto-deploys from main branch)
- Desktop: Electron portable app
- VPS: For development and testing only
## Key URLs
- Production app: proposals.estimator.trade
- Supabase: tozsbxtxurssvznreikr.supabase.co
- GitHub: github.com/jaycolapinto-cyber/estimator-app
- VPS: 100.182.110.100 (Tailscale)
## Key File Locations on VPS
- Estimator app: /home/Jay/apps/estimator-app
- Lead dashboard: /home/Jay/apps/lead-dashboard
- Automations: /home/Jay/.openclaw/workspace/automation
## Deployment Process
- Push to main → Cloudflare auto-deploys within 3 minutes
- Desktop app: trigger desktop-build.yml GitHub Actions workflow
## Working Conventions
- Always run typecheck before pushing
- Never commit credentials or .env files
- Test on VPS port 3001 before pushing to main
- Customer .DUest files live in Dropbox under Jason Colapinto/2026 Potentials, Decks To Be Built, 2026 Completed
## Key People
- Jay Colapinto: owner, main user
- Lou: business partner, uses Cloudflare app
## Current Stack Notes
- Pricing freeze feature added 2026-05-16
- 135 legacy .DUest files migrated with frozen pricing
- New Construction price changed to $1 on 2026-05-16
