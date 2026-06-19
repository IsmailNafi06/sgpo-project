package sgpo.mappers.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import sgpo.dtos.CheminDTO;
import sgpo.dtos.EtapeDTO;
import sgpo.entities.Edge;
import sgpo.entities.Node;
import sgpo.mappers.ParcoursMapper;
import sgpo.services.IAService;

import java.util.*;

@Service
@RequiredArgsConstructor
public class ParcoursMapperImpl implements ParcoursMapper {

    private static final double POIDS_DUREE = 0.0;
    private static final double POIDS_COUT = 0.30;
    private static final double POIDS_REUSSITE = 0.50;
    private static final double POIDS_IA = 0.10;
    private static final double BONUS_COHERENCE = 0.10;
    private static final double BONUS_GRANDE_VILLE = 0.05;

    private static final Set<String> GRANDES_VILLES = Set.of("Casablanca", "Rabat", "Marrakech", "Fès", "Tanger");

    private static final Map<String, Set<String>> BACS_RECOMMANDES_PAR_SECTEUR = Map.of(
            "Santé", Set.of("BAC_SVT", "BAC_SM", "BAC_SE", "BAC_PC"),
            "Informatique", Set.of("BAC_SM", "BAC_SE", "BAC_PC"),
            "Ingénierie", Set.of("BAC_SM", "BAC_SE", "BAC_PC", "BAC_TECH_ELEC", "BAC_TECH_MECA"),
            "Droit", Set.of("BAC_LETTRES", "BAC_SH", "BAC_ECO"),
            "Économie", Set.of("BAC_ECO", "BAC_GC", "BAC_SM"),
            "BTP", Set.of("BAC_SM", "BAC_SE", "BAC_PC", "BAC_TECH_CIVIL"),
            "Éducation", Set.of("BAC_LETTRES", "BAC_SH", "BAC_SE", "BAC_SM"),
            "Finance", Set.of("BAC_ECO", "BAC_GC", "BAC_SM"),
            "Médias", Set.of("BAC_LETTRES", "BAC_SH"),
            "Arts", Set.of("BAC_ARTS_APPLIQUES", "BAC_LETTRES")
    );

    private final IAService iaService;

    @Override
    public CheminDTO convertirEnDTO(List<Edge> edges, Node depart) {
        CheminDTO dto = new CheminDTO();
        dto.setId(UUID.randomUUID().toString());
        List<EtapeDTO> etapes = new ArrayList<>();

        etapes.add(creerEtape(depart, null));

        int dureeTotale = 0;
        double coutTotal = 0;
        double sommeTauxReussite = 0;
        int nbTaux = 0;

        for (Edge edge : edges) {
            Node node = edge.getTarget();
            etapes.add(creerEtape(node, edge));
            if (node.getDureeMois() != null) {
                dureeTotale += node.getDureeMois();
            }
            if (edge.getDureeSupplementaireMois() != null) {
                dureeTotale += edge.getDureeSupplementaireMois();
            }
            if (node.getCoutEstime() != null) {
                coutTotal += node.getCoutEstime();
            }
            if (edge.getCoutSupplementaire() != null) {
                coutTotal += edge.getCoutSupplementaire();
            }
            if (edge.getTauxReussite() != null) {
                sommeTauxReussite += edge.getTauxReussite();
                nbTaux++;
            }
        }

        dto.setEtapes(etapes);
        dto.setDureeTotale(dureeTotale);
        dto.setCoutTotal(coutTotal);

        double tauxMoyen = nbTaux > 0 ? sommeTauxReussite / nbTaux : 100;
        // Bonus de cohérence bac-métier
        double bonusCoherence = 0.0;
        String secteurMetier = etapes.get(etapes.size() - 1).getSecteur(); // récupérer le secteur du métier
// Trouver le bac dans le chemin
        String codeBac = null;
        for (EtapeDTO etape : etapes) {
            if (etape.getCode() != null && etape.getCode().startsWith("BAC_")) {
                codeBac = etape.getCode();
                break;
            }
        }
        if (secteurMetier != null && codeBac != null) {
            Set<String> bacsRecommandes = BACS_RECOMMANDES_PAR_SECTEUR.getOrDefault(secteurMetier, Set.of());
            if (bacsRecommandes.contains(codeBac)) {
                bonusCoherence = BONUS_COHERENCE;
            }
        }

// Bonus de grande ville
        double bonusVille = 0.0;
        for (EtapeDTO etape : etapes) {
            if (etape.getVille() != null && GRANDES_VILLES.contains(etape.getVille())) {
                bonusVille = BONUS_GRANDE_VILLE;
                break;
            }
        }
        double score = POIDS_REUSSITE * (tauxMoyen / 100.0)
                + POIDS_COUT  * (1.0 - Math.min(coutTotal / 100000.0, 1.0))
                + POIDS_IA * 0.5
                + bonusCoherence
                + bonusVille;

       // Plafonner à 1.0 (100%)
        if (score > 1.0) score = 1.0;

        dto.setScoreComposite(Math.round(score * 1000.0) / 10.0);
        //dto.setInterpretation(iaService.genererInterpretation(dto));
        dto.setInterpretation(null);
        return dto;
    }

    @Override
    public EtapeDTO creerEtape(Node node, Edge edge) {
        EtapeDTO etape = new EtapeDTO();
        etape.setCode(node.getCode());
        etape.setNom(node.getNomFr());
        etape.setType(node.getType());
        etape.setDuree(node.getDureeMois());
        etape.setSecteur(node.getSecteur());
        etape.setVille(node.getVille());
        if (edge != null) {
            etape.setTypeLien(edge.getTypeLien());
            etape.setTauxReussite(edge.getTauxReussite());
            etape.setTypeAcces(edge.getTypeAcces() != null ? edge.getTypeAcces().name() : null);
            etape.setMoyenneMinimale(edge.getMoyenneMinimale());
        }
        return etape;
    }
}
