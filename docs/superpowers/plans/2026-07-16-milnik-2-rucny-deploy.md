# Míľnik 2: Ručný deploy — implementačný plán

> **Režim vykonávania:** Tento plán vykonáva POUŽÍVATEĽ ručne, krok za krokom,
> s Claudom ako navigátorom (feedback-teaching-style: malé kroky, kód píše
> používateľ, ku každému kroku teória). Kroky majú checkbox (`- [ ]`) syntax.
> *(Pre agentické spracovanie by platilo: superpowers:executing-plans.)*

**Cieľ:** Appka z míľnika 1 beží v Dockeri na Hetzner VPS a je verejne
dostupná na `https://playground.msgweb.io` s automatickým HTTPS cez Caddy.

**Architektúra:** Multi-stage Dockerfile (deps stage inštaluje závislosti,
runtime stage nesie len to, čo treba). `docker compose` na serveri drží
službu `app` + named volume pre SQLite. Caddy na hoste (mimo Docker) robí
reverse proxy 443 → 127.0.0.1:3000 a sám si vybaví Let's Encrypt certifikát.
Deploy je zámerne RUČNÝ (git clone + build na serveri) — presne tieto kroky
neskôr nahradí CI (míľnik 3) a CD (míľnik 4).

**Tech stack:** Docker + docker compose (na serveri už nainštalované),
Caddy (systemd služba na hoste), node:24-slim base image.

## Globálne obmedzenia

- Server: Hetzner VPS `78.47.222.81`, Ubuntu, prihlásenie len SSH kľúčom
- DNS: `playground.msgweb.io` → 78.47.222.81 (už nastavené)
- Port appky viazaný LEN lokálne: `127.0.0.1:3000:3000` — von ide všetko cez Caddy
- SQLite v named volume, cesta v kontajneri `/data/uptime.db`
- `ADMIN_PASSWORD` v `.env` súbore na serveri — nikdy v gite
- Restart policy, healthchecky, deploy user = míľnik 5 (teraz zámerne nie)
- Príkazy lokálne z `C:\Users\patri\uptime-monitor`; na serveri z `/opt/uptime-monitor`
- Commit po každom tasku; správy po slovensky, v rozkazovacom spôsobe

## Štruktúra súborov

```
uptime-monitor/
  Dockerfile            — multi-stage build image
  .dockerignore         — čo sa NEposiela do build kontextu
  docker-compose.yml    — služba app + volume, čítanie .env
  .gitignore            — pribudne .env
  (na serveri) /opt/uptime-monitor/.env — ADMIN_PASSWORD (mimo gitu)
```

---

### Task 0: Predpoklady

**Files:** žiadne

**Interfaces:**
- Produces: overený SSH prístup na server, funkčný Docker na serveri,
  DNS záznam ukazujúci na server.

- [ ] **Krok 0.1: Over SSH prístup z notebooku**

```
ssh root@78.47.222.81 "echo ok"
```

Očakávané: `ok`. Ak pýta heslo/zlyhá, treba doriešiť SSH kľúč skôr, než čokoľvek iné.

- [ ] **Krok 0.2: Over Docker a compose na serveri**

```
ssh root@78.47.222.81 "docker --version && docker compose version && systemctl is-active caddy"
```

Očakávané: verzie Dockeru a compose + `active` pre Caddy.

- [ ] **Krok 0.3: Over DNS**

```
nslookup playground.msgweb.io
```

Očakávané: odpoveď obsahuje `78.47.222.81`.

---

### Task 1: Dockerfile + .dockerignore

**Files:**
- Create: `Dockerfile`, `.dockerignore`

**Interfaces:**
- Consumes: `package.json`, `package-lock.json`, `src/`, `public/` z míľnika 1
- Produces: image, ktorý po `docker run` spustí `node src/server.js`
  a počúva na porte 3000; `/data` v kontajneri patrí userovi `node`.

- [ ] **Krok 1.1: Vytvor `.dockerignore`**

```
node_modules/
data/
*.db
.git/
docs/
test/
```

- [ ] **Krok 1.2: Vytvor `Dockerfile`**

```dockerfile
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY public ./public
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
```

- [ ] **Krok 1.3: (Voliteľné — len ak máš lokálne Docker Desktop) Lokálny build a test**

```
docker build -t uptime-monitor .
docker run --rm -e DB_PATH=/data/uptime.db -p 3000:3000 uptime-monitor
```

V druhom termináli: `curl localhost:3000/health` → `{"status":"ok"}`.
Kontajner zastav Ctrl+C. Ak Docker lokálne nemáš, preskoč — build sa overí
na serveri v Tasku 3.

- [ ] **Krok 1.4: Commit**

```
git add Dockerfile .dockerignore
git commit -m "Pridaj multi-stage Dockerfile pre produkcny image"
```

---

### Task 2: docker-compose.yml

**Files:**
- Create: `docker-compose.yml`
- Modify: `.gitignore` (pridaj riadok `.env`)

**Interfaces:**
- Consumes: `Dockerfile` z Tasku 1; env premenné `DB_PATH`, `ADMIN_PASSWORD`
  ktoré číta `src/server.js`
- Produces: `docker compose up -d --build` postaví a spustí appku
  s perzistentným volume `uptime-data`; heslo číta z `.env` súboru.

- [ ] **Krok 2.1: Vytvor `docker-compose.yml`**

```yaml
services:
  app:
    build: .
    image: uptime-monitor
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      DB_PATH: /data/uptime.db
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
    volumes:
      - uptime-data:/data

volumes:
  uptime-data:
```

- [ ] **Krok 2.2: Pridaj `.env` do `.gitignore`**

`.gitignore` po zmene:

```
node_modules/
data/
*.db
.env
```

- [ ] **Krok 2.3: Commit + push**

```
git add docker-compose.yml .gitignore
git commit -m "Pridaj docker compose so SQLite volume a env konfiguraciou"
git push
```

---

### Task 3: Deploy na server

**Files:**
- Create (na serveri): `/opt/uptime-monitor` (git clone), `/opt/uptime-monitor/.env`

**Interfaces:**
- Consumes: GitHub repo `puciferr/uptime-monitor` (push z Tasku 2)
- Produces: bežiaci kontajner na serveri, `/health` odpovedá na
  `127.0.0.1:3000` (zatiaľ len zvnútra servera).

- [ ] **Krok 3.1: Prihlás sa na server a naklonuj repo**

```
ssh root@78.47.222.81
cd /opt
git clone https://github.com/puciferr/uptime-monitor.git
cd uptime-monitor
```

Očakávané: `Cloning into 'uptime-monitor'...` a priečinok existuje.

- [ ] **Krok 3.2: Vytvor `.env` so silným heslom (na serveri)**

```
echo "ADMIN_PASSWORD=$(openssl rand -base64 18)" > .env
cat .env
```

Heslo si ODLOŽ (password manager) — budeš ho zadávať pri správe monitorov.

- [ ] **Krok 3.3: Build + spusti**

```
docker compose up -d --build
```

Očakávané: build log končí `Started` / `Running`, `docker compose ps`
ukazuje službu `app` v stave `Up`.

- [ ] **Krok 3.4: Over zvnútra servera**

```
curl http://127.0.0.1:3000/health
docker compose logs --tail 5 app
```

Očakávané: `{"status":"ok"}` a v logu `Uptime monitor beží na http://localhost:3000`.

Zvonku port 3000 dostupný NIE JE (viazaný na 127.0.0.1) — over pokojne
z notebooku: `curl -m 5 http://78.47.222.81:3000/health` → timeout. Správne.

---

### Task 4: Caddy reverse proxy + HTTPS

**Files:**
- Modify (na serveri): `/etc/caddy/Caddyfile`

**Interfaces:**
- Consumes: bežiaci kontajner na `127.0.0.1:3000` (Task 3)
- Produces: `https://playground.msgweb.io` verejne dostupné s platným
  certifikátom.

- [ ] **Krok 4.1: Pridaj blok do Caddyfile (na serveri)**

Otvor `/etc/caddy/Caddyfile` (napr. `nano /etc/caddy/Caddyfile`) a pridaj:

```
playground.msgweb.io {
    reverse_proxy 127.0.0.1:3000
}
```

- [ ] **Krok 4.2: Zvaliduj a reloadni Caddy**

```
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
systemctl status caddy --no-pager
```

Očakávané: `Valid configuration`, status `active (running)`. Caddy si
do pár sekúnd vybaví Let's Encrypt certifikát (sleduj `journalctl -u caddy -f`
ak chceš vidieť ACME handshake).

- [ ] **Krok 4.3: Over z notebooku**

V prehliadači: `https://playground.msgweb.io` → status stránka, platný
certifikát (zámok). Alebo:

```
curl https://playground.msgweb.io/health
```

Očakávané: `{"status":"ok"}`.

- [ ] **Krok 4.4: Pridaj produkčné monitory**

Z notebooku (HESLO = to z kroku 3.2):

```
curl -u admin:HESLO -H "Content-Type: application/json" -d "{\"name\":\"Google\",\"url\":\"https://www.google.com\"}" https://playground.msgweb.io/api/monitors
```

Očakávané: `{"id":1,...}` a do minúty karta na stránke so zeleným kolieskom.

---

### Task 5: Overenie míľnika + upratanie

**Files:**
- Modify: `docs/superpowers/plans/2026-07-16-milnik-2-rucny-deploy.md` (checkboxy)

- [ ] **Krok 5.1: Definícia hotovo**

1. `https://playground.msgweb.io` ukazuje status stránku s monitormi (HTTPS, platný cert)
2. `docker compose ps` na serveri: služba `app` beží
3. Reštart kontajnera nezmaže dáta: `docker compose restart` → monitory stále na stránke (volume funguje)
4. Port 3000 zvonku nedostupný, admin API bez hesla vracia 401:
   `curl -X POST https://playground.msgweb.io/api/monitors` → 401

- [ ] **Krok 5.2: Commit checkboxov**

```
git add docs/
git commit -m "Odskrtni dokoncene kroky milnika 2"
git push
```

---

## Overenie míľnika (definícia hotovo)

1. Živé `https://playground.msgweb.io` s automatickým HTTPS
2. Appka v Dockeri, SQLite v named volume (prežije reštart kontajnera)
3. Port 3000 len na 127.0.0.1; von výhradne cez Caddy
4. Heslo admina v `.env` na serveri, nie v gite
