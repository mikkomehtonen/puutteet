# Puutteet

Puutteet (Finnish for "shortages" or "things missing") is a self-hosted shopping list web application for a single user. It solves the problem of tracking household items that need to be purchased — the user adds items as they notice something running low at home, then checks the list while shopping and marks items as bought. The app runs on a private home server accessed through Tailscale, so it has no authentication, no multi-user support, and no public internet exposure requirements.

## Features

- **Shopping List** — add, check off, restore, and delete shopping items with a mobile-first UI ([story](stories/001-shopping-list-app/story.md))

## Non-Goals

- Multi-user support or authentication/authorization.
- Public internet exposure or HTTPS termination (handled by Tailscale).
- Sharing lists, categories, or multiple lists.
- Barcode scanning, price tracking, or recipe integration.
- Push notifications.
- Native mobile apps (web only).

## Known Limitations

- Single-user only — anyone with network access can modify the list.
- No offline support — requires network connectivity to the home server.
- No item history or analytics beyond the current list state.