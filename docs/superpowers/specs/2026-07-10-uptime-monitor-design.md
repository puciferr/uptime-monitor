# Uptime monitor + DevOps pipeline — design

**Dátum:** 2026-07-10
**Stav:** schválený návrh (prístup A — najprv appka, potom po vrstvách DevOps)

## Cieľ

Učebný „20% time" projekt. Viditeľný výstup: verejná status stránka na
`https://playground.msgweb.io`, ktorá monitoruje dostupnosť webov/služieb.
Skutočný učebný cieľ: kompletná DevOps mašinéria okolo malej aplikácie —
CI/CD, monitoring, zálohy, alerting, rollback — na vlastnom VPS.

## Kontext prostredia

- **Server:** Hetzner VPS `ubuntu-16gb-fsn1-1` (78.47.222.81), Ubuntu 26.04.
  Nainštalované: Docker + compose, Caddy (systemd služba, zatiaľ prázdny
  Caddyfile), fail2ban, ufw (povolené 22/80/443/8080).
- **DNS:** `playground.msgweb.io` → 78.47.222.81 (A záznam, DNS u GoDaddy).
  Pre Grafanu pribudne `grafana.msgweb.io` (míľnik 6).
- **Vývoj:** Windows 11 notebook, git + GitHub účet k dispozícii.
- **SSH:** prihlásenie len kľúčom (heslá vypnuté), kľúče notebooku aj desktopu
  sú v `authorized_keys`.

## Appka (verzia 1)

- **Stack:** Node.js + Express, frontend čisté HTML/JS (bez frameworku —
  fokus projektu je DevOps, nie frontend).
- **Databáza:** SQLite — jeden súbor v Docker volume. Zámerne najjednoduchšia
  voľba: menej pohyblivých častí, záloha = kópia súboru.
- **Dátový model:**
  - `monitors` (id, name, url, created_at)
  - `checks` (id, monitor_id, ts, status_code, ok, latency_ms)
- **Checker:** každých 60 s HTTP GET na každú URL, timeout 10 s.
  1 neúspech = down (bez retry vo v1). Chyba requestu nesmie zhodiť appku.
- **Endpointy:**
  - `GET /` — verejná status stránka (zelená/červená, uptime % za 24 h,
    graf latencie)
  - `GET /api/monitors` — dáta pre stránku
  - `POST /api/monitors`, `DELETE /api/monitors/:id` — správa monitorov,
    chránené Basic Auth (heslo v env premennej)
  - `GET /health` — healthcheck endpoint pre Docker/monitoring
- **Retencia:** záznamy `checks` staršie ako 30 dní maže denný job.

## Infraštruktúra

- **Image:** multi-stage Dockerfile, publikovaný do GitHub Container
  Registry (`ghcr.io/<github-user>/uptime-monitor`).
- **Beh na serveri:** `docker compose` — služba `app` + named volume pre
  SQLite. Port viazaný len lokálne: `127.0.0.1:3000:3000` (von ide všetko
  cez Caddy).
- **Caddy (na hoste, mimo Docker):**
  `playground.msgweb.io { reverse_proxy 127.0.0.1:3000 }` — HTTPS certifikát
  automaticky.
- **CI (GitHub Actions):** pri každom pushi testy (`node --test`) + build
  image; pri pushi na `main` aj push do GHCR.
- **CD:** GitHub Actions cez SSH spustí na serveri
  `docker compose pull && docker compose up -d`. Samostatný SSH kľúč len pre
  Actions (uložený v GitHub Secrets); v míľniku 5 samostatný `deploy`
  používateľ namiesto roota.
- **Monitoring:** Prometheus + node_exporter (metriky servera) + Grafana na
  `grafana.msgweb.io` (chránená prihlásením).
- **Zálohy:** denne `sqlite3 .backup` → kópia mimo server; súčasťou míľnika 7
  je povinná skúška obnovy (restore drill).
- **Rollback:** images tagované číslom buildu (nie iba `latest`), návrat =
  deploy predošlého tagu.

## Míľniky

1. **Appka lokálne** — Express + SQLite + checker; status stránka na
   localhoste.
2. **Ručný deploy** — Dockerfile, compose, Caddy blok; živé
   `https://playground.msgweb.io`.
3. **CI** — GitHub Actions: testy + build image do GHCR pri každom pushi.
4. **CD** — push na `main` = automatický deploy na server.
5. **Ops hygiena** — healthchecky, restart policy, práca s logmi, deploy
   user + secrets, upratanie ufw (zavrieť nepoužívaný port 8080).
6. **Monitoring** — Prometheus + node_exporter + Grafana dashboard,
   `grafana.msgweb.io` + nový DNS záznam.
7. **Zálohy + obnova** — automatická denná záloha DB mimo server, otestovaná
   obnova.
8. **Alerting + rollback** — notifikácia (Telegram/email) pri páde monitoru
   aj pri páde vlastnej appky; rollback na predošlú verziu jedným krokom.

Tempo: ~1 míľnik za 1–2 pracovné „20%" dni. Každý míľnik končí viditeľným,
predvediteľným výsledkom.

## Testovanie a error handling

- Unit testy checkera (mocknutý fetch: OK / timeout / 500) a API testy —
  bežia lokálne aj v CI (`node --test`, bez ďalších závislostí).
- Checker beží v try/catch; nedostupná URL sa zapíše ako `ok = false`,
  appka beží ďalej.
- SQLite zápisy cez prepared statements (ochrana pred SQL injection).

## Kľúčové rozhodnutia (a prečo)

- **SQLite, nie Postgres:** Postgres je už zvládnutý (notes-app); SQLite
  minimalizuje ops záťaž a zjednodušuje zálohy. Lekcia „boring tech".
- **Vanilla frontend:** nové učivo má byť DevOps, nie ďalší framework.
- **GHCR, nie Docker Hub:** priama integrácia s GitHub Actions, zadarmo.
- **Prometheus + Grafana, nie hotové riešenie (Uptime Kuma, Netdata):**
  cieľom je naučiť sa trhovo najžiadanejší monitoring stack, nie len mať
  výsledok.
- **Prístup A (appka → vrstvy automatizácie):** každá vrstva sa učí náhradou
  ručného kroku, ktorý si používateľ predtým zažil.

## Mimo rozsahu v1

- Viac používateľov / registrácia (admin je jeden, Basic Auth stačí)
- Retry logika a sofistikovanejšie detekcie výpadkov
- React/SPA frontend
- Kubernetes (server je jeden; compose stačí a je to poctivejšia lekcia)
