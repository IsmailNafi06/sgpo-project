package sgpo.services.impl;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import sgpo.dtos.CheminDTO;
import sgpo.entities.Edge;
import sgpo.entities.Node;
import sgpo.enums.EdgeType;
import sgpo.enums.NodeType;
import sgpo.enums.TypeAcces;
import sgpo.exceptions.GrapheException;
import sgpo.mappers.ParcoursMapper;
import sgpo.repositories.EdgeRepository;
import sgpo.repositories.NodeRepository;
import sgpo.services.GrapheService;
import sgpo.services.IAService;

import java.util.*;
import java.util.stream.Collectors;

@RequiredArgsConstructor
@Slf4j
@Service
public class GrapheServiceImpl implements GrapheService {

    private final NodeRepository nodeRepository;
    private final EdgeRepository edgeRepository;
    private final ParcoursMapper parcoursMapper;
    private final IAService iaService;

    private static final int PROFONDEUR_MAX = 12;
    private static final int MAX_CHEMINS = 50;
    @Transactional(readOnly = true)
    @Override
    public List<CheminDTO> trouverTousLesChemins(String codeDepart, String codeArrivee,
                                                 Double moyenne, String mobilite,
                                                 String villeDepart, Integer dureeMax, Double coutMax, TypeAcces typeAccesFiltre) throws GrapheException {
        Node depart = nodeRepository.findByCode(codeDepart)
                .orElseThrow(() -> new GrapheException("Niveau de départ introuvable : " + codeDepart));
        Node arrivee = nodeRepository.findByCode(codeArrivee)
                .orElseThrow(() -> new GrapheException("Métier cible introuvable : " + codeArrivee));

        List<Edge> toutesEdges = edgeRepository.findAllWithNodes();

        // Construire le graphe d'adjacence
        Map<String, List<Edge>> adjacence = new HashMap<>();
        for (Edge edge : toutesEdges) {
            adjacence.computeIfAbsent(edge.getSource().getId(), k -> new ArrayList<>()).add(edge);
            // Pour OFFERTE_PAR, créer une vraie arête inversée (établissement -> filière)
            if (edge.getTypeLien() == EdgeType.OFFERTE_PAR) {
                Edge reverse = new Edge();
                reverse.setId(edge.getId() + "_REV");
                reverse.setSource(edge.getTarget());
                reverse.setTarget(edge.getSource());
                reverse.setTypeLien(edge.getTypeLien());
                reverse.setTauxReussite(edge.getTauxReussite());
                reverse.setCoutSupplementaire(edge.getCoutSupplementaire());
                reverse.setDureeSupplementaireMois(edge.getDureeSupplementaireMois());
                reverse.setPrerequisNotes(edge.getPrerequisNotes());
                reverse.setMoyenneMinimale(edge.getMoyenneMinimale());
                reverse.setTypeAcces(edge.getTypeAcces());
                adjacence.computeIfAbsent(reverse.getSource().getId(), k -> new ArrayList<>()).add(reverse);
            }
        }
        // BFS
        List<List<Edge>> tousChemins = new ArrayList<>();
        Queue<List<Edge>> queue = new LinkedList<>();

        // Arêtes initiales, filtrées selon la ville de départ
        List<Edge> initialEdges = adjacence.getOrDefault(depart.getId(), Collections.emptyList())
                .stream()
                .collect(Collectors.toList());
        log.info("Arêtes candidates après filtre ville : {}", initialEdges.size());
        for (Edge edge : initialEdges) {
            log.info("Candidat : {} -> {}",
                    edge.getSource() != null ? edge.getSource().getCode() : "?",
                    edge.getTarget() != null ? edge.getTarget().getCode() : "?");
        }

        for (Edge edge : initialEdges) {
            if (isTransitionValide(edge, moyenne, mobilite)) {
                queue.add(new ArrayList<>(List.of(edge)));
            }
        }

        int cheminsTrouves = 0;

        while (!queue.isEmpty()) {
            List<Edge> chemin = queue.poll();
            // Limite de profondeur
            if (chemin.size() >= PROFONDEUR_MAX) {
                continue;
            }
            Edge dernierEdge = chemin.get(chemin.size() - 1);
            Node currentNode = dernierEdge.getTarget();

            if (currentNode.getId().equals(arrivee.getId())) {
                tousChemins.add(new ArrayList<>(chemin));
                cheminsTrouves++;
                if (cheminsTrouves >= MAX_CHEMINS) {
                    break;
                }
                continue;
            }

            for (Edge edge : adjacence.getOrDefault(currentNode.getId(), Collections.emptyList())) {
                // Empêcher deux OFFERTE_PAR consécutives
                if (edge.getTypeLien() == EdgeType.OFFERTE_PAR) {
                    boolean derniereEtaitOFFERTE = false;
                    if (!chemin.isEmpty()) {
                        Edge derniere = chemin.get(chemin.size() - 1);
                        if (derniere.getTypeLien() == EdgeType.OFFERTE_PAR) {
                            derniereEtaitOFFERTE = true;
                        }
                    }
                    if (derniereEtaitOFFERTE) {
                        continue; // on refuse deux OFFERTE_PAR à la suite
                    }
                }
                // Vérifier que la source de l'arête inverse est bien un établissement
                if (edge.getTypeLien() == EdgeType.OFFERTE_PAR) {
                    Node sourceNode = edge.getSource();
                    if (sourceNode.getType() != NodeType.ETABLISSEMENT) {
                        continue;
                    }
                }

                if (isTransitionValide(edge, moyenne, mobilite) && !contientCycle(chemin, edge)) {
                    // Empêcher d'enchaîner deux filières longues (durée >= 24 mois)
                    if (edge.getTypeLien() == EdgeType.OFFERTE_PAR || edge.getTypeLien() == EdgeType.ADMISSION) {
                        Node targetNode = edge.getTarget();
                        if (targetNode.getDureeMois() != null && targetNode.getDureeMois() >= 24) {
                            // Vérifier si le chemin contient déjà une filière longue
                            boolean aDejaFiliereLongue = false;
                            for (Edge e : chemin) {
                                Node n = e.getTarget();
                                if (n.getDureeMois() != null && n.getDureeMois() >= 24 && n.getType() == NodeType.FILIERE) {
                                    aDejaFiliereLongue = true;
                                    break;
                                }
                            }
                            if (aDejaFiliereLongue) {
                                continue; // on refuse d'enchaîner deux filières longues
                            }
                        }
                    }

                    List<Edge> nouveauChemin = new ArrayList<>(chemin);
                    nouveauChemin.add(edge);
                    queue.add(nouveauChemin);
                }
            }
        }

        // Filtrer par ville si mobilité = VILLE
        if (villeDepart != null && !villeDepart.isBlank() && "VILLE".equalsIgnoreCase(mobilite)) {
            tousChemins = tousChemins.stream()
                    .filter(chemin -> contientEtablissementDansVille(chemin, villeDepart.trim()))
                    .collect(Collectors.toList());
            log.info("Après filtre ville ({}), {} chemins restants.", villeDepart, tousChemins.size());
        }

        // Appliquer les filtres utilisateur (durée max, coût max, type d'accès)
        if (dureeMax != null || coutMax != null || (typeAccesFiltre != null )) {
            tousChemins = tousChemins.stream()
                    .filter(chemin -> {
                        // Calculer la durée totale et le coût total du chemin
                        int dureeChemin = 0;
                        double coutChemin = 0;
                        for (Edge edge : chemin) {
                            Node node = edge.getTarget();
                            if (node.getDureeMois() != null) dureeChemin += node.getDureeMois();
                            if (edge.getDureeSupplementaireMois() != null) dureeChemin += edge.getDureeSupplementaireMois();
                            if (node.getCoutEstime() != null) coutChemin += node.getCoutEstime();
                            if (edge.getCoutSupplementaire() != null) coutChemin += edge.getCoutSupplementaire();
                        }

                        // Filtre durée maximale
                        if (dureeMax != null && dureeChemin > dureeMax) return false;

                        // Filtre coût maximal
                        if (coutMax != null && coutChemin > coutMax) return false;

                        // Filtre type d'accès
                        if (typeAccesFiltre != null) {
                            boolean aCeType = false;
                            for (Edge edge : chemin) {
                                if (typeAccesFiltre == edge.getTypeAcces()) {
                                    aCeType = true;
                                    break;
                                }
                            }
                            if (!aCeType) return false;
                        }
                        return true;
                    })
                    .collect(Collectors.toList());
        }

        // Limiter le nombre final de chemins
        List<List<Edge>> cheminsLimités = tousChemins.stream()
                .limit(MAX_CHEMINS)
                .collect(Collectors.toList());

        // Conversion en DTO et scoring
        List<CheminDTO> resultats = cheminsLimités.stream()
                .map(cheminEdges -> parcoursMapper.convertirEnDTO(cheminEdges, depart))
                .sorted(Comparator.comparingDouble(CheminDTO::getScoreComposite).reversed())
                .collect(Collectors.toList());

// Générer l'interprétation IA pour les 5 meilleurs chemins uniquement
        for (int i = 0; i < resultats.size(); i++) {
            CheminDTO chemin = resultats.get(i);
            if (i < 3) {
                chemin.setInterpretation(iaService.genererInterpretation(chemin));
            } else {
                chemin.setInterpretation("Ce parcours dure " + (chemin.getDureeTotale() / 12) + " ans et coûte " + (int) chemin.getCoutTotal() + " DH.");
            }
        }

        log.info("{} chemins trouvés de {} à {}", resultats.size(), codeDepart, codeArrivee);
        return resultats;
    }

    // Filtre générique (moyenne, mobilité pour les étapes suivantes)
    private boolean isTransitionValide(Edge edge, Double moyenne, String mobilite) {
        if (moyenne != null && edge.getMoyenneMinimale() != null && moyenne < edge.getMoyenneMinimale()) {
            return false;
        }
        // La mobilité VILLE est déjà filtrée au premier pas ; pour les étapes suivantes,
        // nous n'appliquons pas de restriction supplémentaire, sauf si vous voulez limiter
        // les changements de ville. Nous laissons libre.
        return true;
    }

    // Détection de cycle simple
    private boolean contientCycle(List<Edge> chemin, Edge nouvelle) {
        String newTargetId = nouvelle.getTarget().getId();
        for (Edge e : chemin) {
            if (e.getSource().getId().equals(newTargetId)
                    || e.getTarget().getId().equals(newTargetId)) {
                return true; // la cible de la nouvelle arête est déjà dans le chemin
            }
        }
        return false;
    }

    private boolean contientEtablissementDansVille(List<Edge> chemin, String ville) {
        for (Edge edge : chemin) {
            Node source = edge.getSource();
            Node target = edge.getTarget();

            // Si la source a une ville ET que cette ville n'est pas la ville demandée → rejet
            if (source.getVille() != null && !source.getVille().equalsIgnoreCase(ville)) {
                return false;
            }
            // Si la cible a une ville ET que cette ville n'est pas la ville demandée → rejet
            if (target.getVille() != null && !target.getVille().equalsIgnoreCase(ville)) {
                return false;
            }
        }
        // Toutes les étapes avec une ville sont dans la ville demandée
        return true;
    }
}
