# E-Tawjihi — Système d'Orientation Scolaire et Professionnelle (SGPO)

Plateforme web d'aide à l'orientation scolaire et professionnelle au Maroc. Le système modélise le parcours éducatif marocain sous forme de **graphe orienté** et génère des chemins personnalisés entre le niveau actuel d'un élève et le métier visé, avec enrichissement par IA.

---

## Fonctionnalités principales

### Espace étudiant
- Recherche de parcours par niveau, métier cible, moyenne, mobilité géographique et contraintes financières
- Génération de plusieurs chemins comparables avec score composite
- Export PDF du parcours sélectionné
- Partage de parcours via lien unique
- Comparaison côte à côte de plusieurs parcours
- Sauvegarde de parcours favoris (local)

### Enrichissement IA
- Interprétation des parcours par RAG (Retrieval-Augmented Generation)
- Corpus de 1 791 fiches métiers vectorisées (pgvector + OpenAI embeddings)
- Génération d'explications personnalisées via GPT-4o mini

### Interface administrateur
- Dashboard de qualité des données (nœuds orphelins, descriptions manquantes)
- CRUD complet sur les nœuds (niveaux, filières, établissements, métiers)
- CRUD complet sur les arêtes (liens entre nœuds)
- Import/Export CSV pour la mise à jour des données
- Upload de documents RAG
- Journal d'audit des modifications

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Backend | Spring Boot 4 · Java 17 · Maven |
| Frontend | React 19 · Vite · Tailwind CSS |
| Base de données | PostgreSQL 16 + extension pgvector |
| IA | Spring AI · OpenAI GPT-4o mini · text-embedding-3-small |
| Sécurité | JWT (HMAC-SHA512) · Spring Security |
| Déploiement | Docker · docker-compose · nginx |

---

## Architecture

```
Navigateur
    │
    ▼
nginx (port 80)
    ├── /              → fichiers React (SPA)
    └── /api/*         → proxy vers Spring Boot (port 8081)
                              │
                              ▼
                       Spring Boot
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
               PostgreSQL           OpenAI API
            (graphe + pgvector)   (embeddings + chat)
```

**Graphe de données :** 4 264 nœuds (2 niveaux, 2 983 filières, 610 établissements, 669 métiers) · 15 681 arêtes

---

## Lancer le projet

### Avec Docker (recommandé)

**Prérequis :** Docker Desktop installé

```bash
# 1. Cloner le projet
git clone https://github.com/IsmailNafi06/sgpo-project.git
cd sgpo-project

# 2. Configurer les variables d'environnement
cp .env.example .env
# Éditer .env et renseigner OPENAI_API_KEY et ADMIN_PASSWORD

# 3. Lancer
docker-compose up --build
```

L'application est disponible sur **http://localhost**

### En développement local

**Prérequis :** Java 17+, Maven, Node.js 20+, PostgreSQL 16 avec pgvector

```bash
# Base de données
# Créer une base sgpo_unifie sur PostgreSQL local
# Activer l'extension pgvector : CREATE EXTENSION vector;

# Backend
cd backend
mvn spring-boot:run

# Frontend (dans un autre terminal)
cd frontend
npm install
npm run dev
```

Frontend disponible sur **http://localhost:5173**

---

## Variables d'environnement

| Variable | Description | Obligatoire |
|----------|-------------|-------------|
| `OPENAI_API_KEY` | Clé API OpenAI pour le RAG et GPT-4o mini | Oui |
| `ADMIN_USERNAME` | Nom d'utilisateur admin (défaut : `admin`) | Non |
| `ADMIN_PASSWORD` | Mot de passe du compte admin initial | Oui |

---

## Accès

| URL | Description |
|-----|-------------|
| `http://localhost` | Application (mode Docker) |
| `http://localhost:5173` | Application (mode développement) |
| `http://localhost:8081/swagger-ui/index.html` | Documentation API (Swagger) |
| `http://localhost/admin` | Interface d'administration |

---

## Auteur

**Ismail Nafi** — Projet de stage · 2026
