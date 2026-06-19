# SGPO - Système de Génération de Parcours d'Orientation

Backend Spring Boot pour la plateforme E-Tawjihi.ma.

## Objectif

Générer automatiquement tous les parcours académiques possibles depuis n'importe quel niveau scolaire (3AC, TC, 1BAC, 2BAC) jusqu'à un métier visé. Le système modélise le système éducatif marocain sous forme de graphe orienté, explore les chemins avec un BFS, et enrichit l'expérience avec une IA générative (RAG + GPT-4o mini).

## Stack technique

- Java 17, Spring Boot 3
- MySQL (entités Node, Edge, AppUser, AuditLog)
- PostgreSQL + pgvector (recherche vectorielle RAG)
- Spring Security + JWT (authentification admin)
- Spring AI (OpenAI)
- Swagger (documentation API)

## Lancement

```bash
./mvnw spring-boot:run