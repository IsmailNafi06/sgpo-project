package sgpo.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
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
import sgpo.services.IAService;
import sgpo.services.impl.GrapheServiceImpl;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Tests unitaires de l'algorithme BFS (GrapheService).
 *
 * Ces tests n'utilisent pas de base de données : les repositories
 * sont simulés (mockés) avec Mockito. Chaque test crée un mini-graphe
 * en mémoire pour vérifier un comportement précis de l'algorithme.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("GrapheService — Tests de l'algorithme BFS")
class GrapheServiceTest {

    // Les dépendances sont "mockées" : Mockito crée de faux objets
    // qui simulent le comportement de la base de données
    @Mock private NodeRepository nodeRepository;
    @Mock private EdgeRepository edgeRepository;
    @Mock private ParcoursMapper parcoursMapper;
    @Mock private IAService iaService;

    // GrapheServiceImpl est le vrai objet testé
    // @InjectMocks lui injecte automatiquement les mocks ci-dessus
    @InjectMocks
    private GrapheServiceImpl grapheService;

    // Nœuds et arêtes communs à tous les tests
    private Node niveau;
    private Node filiere;
    private Node metier;
    private Edge edgeNiveauFiliere;
    private Edge edgeFiliereMetier;

    /**
     * Avant chaque test, on construit un mini-graphe :
     * NIVEAU_TC --(DONNE_ACCES)--> FILIERE_BTS --(RECRUTEMENT)--> METIER_INFO
     */
    @BeforeEach
    void setUp() {
        niveau  = creerNode("1", "NIVEAU_TC",   NodeType.NIVEAU);
        filiere = creerNode("2", "FILIERE_BTS", NodeType.FILIERE);
        filiere.setDureeMois(24);
        filiere.setCoutEstime(5000.0);
        metier  = creerNode("3", "METIER_INFO", NodeType.METIER);

        edgeNiveauFiliere = creerEdge("e1", niveau,  filiere, EdgeType.DONNE_ACCES);
        edgeFiliereMetier = creerEdge("e2", filiere, metier,  EdgeType.RECRUTEMENT);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 1 : chemin valide → résultats retournés
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Chemin simple trouvé entre deux nœuds connectés")
    void chemin_simple_trouve() throws GrapheException {
        // GIVEN : le graphe contient NIVEAU → FILIERE → METIER
        when(nodeRepository.findByCode("NIVEAU_TC")).thenReturn(Optional.of(niveau));
        when(nodeRepository.findByCode("METIER_INFO")).thenReturn(Optional.of(metier));
        when(edgeRepository.findAllWithNodes()).thenReturn(List.of(edgeNiveauFiliere, edgeFiliereMetier));
        when(parcoursMapper.convertirEnDTO(any(), any())).thenReturn(creerCheminDTO());
        when(iaService.genererInterpretation(any())).thenReturn("Bon parcours");

        // WHEN : on lance la recherche sans filtre
        List<CheminDTO> resultats = grapheService.trouverTousLesChemins(
                "NIVEAU_TC", "METIER_INFO", null, null, null, null, null, null);

        // THEN : au moins un chemin est trouvé
        assertThat(resultats)
                .as("Le BFS doit trouver au moins un chemin entre NIVEAU_TC et METIER_INFO")
                .isNotEmpty();

        // On vérifie que la base de données a bien été consultée une seule fois
        verify(edgeRepository, times(1)).findAllWithNodes();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 2 : nœud de départ inexistant → exception
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Code de départ inexistant → GrapheException avec le code dans le message")
    void code_depart_inexistant_leve_exception() {
        // GIVEN : le nœud "CODE_BIDON" n'existe pas en base
        when(nodeRepository.findByCode("CODE_BIDON")).thenReturn(Optional.empty());

        // WHEN + THEN : une GrapheException est lancée et contient le code erroné
        assertThatThrownBy(() ->
                grapheService.trouverTousLesChemins(
                        "CODE_BIDON", "METIER_INFO", null, null, null, null, null, null))
                .isInstanceOf(GrapheException.class)
                .hasMessageContaining("CODE_BIDON");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 3 : nœud d'arrivée inexistant → exception
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Code d'arrivée inexistant → GrapheException avec le code dans le message")
    void code_arrivee_inexistant_leve_exception() {
        // GIVEN : le départ existe mais pas l'arrivée
        when(nodeRepository.findByCode("NIVEAU_TC")).thenReturn(Optional.of(niveau));
        when(nodeRepository.findByCode("METIER_BIDON")).thenReturn(Optional.empty());

        // WHEN + THEN
        assertThatThrownBy(() ->
                grapheService.trouverTousLesChemins(
                        "NIVEAU_TC", "METIER_BIDON", null, null, null, null, null, null))
                .isInstanceOf(GrapheException.class)
                .hasMessageContaining("METIER_BIDON");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 4 : filtre moyenne trop basse → chemin inaccessible
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Filtre moyenne : chemin exigeant 15/20 est rejeté si l'étudiant a 10/20")
    void filtre_moyenne_exclut_chemin_trop_exigeant() throws GrapheException {
        // GIVEN : l'arête vers la filière exige une moyenne de 15/20
        edgeNiveauFiliere.setMoyenneMinimale(15.0);

        when(nodeRepository.findByCode("NIVEAU_TC")).thenReturn(Optional.of(niveau));
        when(nodeRepository.findByCode("METIER_INFO")).thenReturn(Optional.of(metier));
        when(edgeRepository.findAllWithNodes()).thenReturn(List.of(edgeNiveauFiliere, edgeFiliereMetier));

        // WHEN : l'étudiant a seulement 10/20
        List<CheminDTO> resultats = grapheService.trouverTousLesChemins(
                "NIVEAU_TC", "METIER_INFO", 10.0, null, null, null, null, null);

        // THEN : aucun chemin disponible (le filtre bloque le seul chemin existant)
        assertThat(resultats)
                .as("Avec une moyenne de 10/20, le chemin exigeant 15/20 ne doit pas apparaître")
                .isEmpty();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 5 : filtre moyenne suffisante → chemin accessible
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Filtre moyenne : chemin accessible si l'étudiant a une moyenne suffisante")
    void filtre_moyenne_accepte_chemin_accessible() throws GrapheException {
        // GIVEN : l'arête exige 12/20, l'étudiant a 14/20
        edgeNiveauFiliere.setMoyenneMinimale(12.0);

        when(nodeRepository.findByCode("NIVEAU_TC")).thenReturn(Optional.of(niveau));
        when(nodeRepository.findByCode("METIER_INFO")).thenReturn(Optional.of(metier));
        when(edgeRepository.findAllWithNodes()).thenReturn(List.of(edgeNiveauFiliere, edgeFiliereMetier));
        when(parcoursMapper.convertirEnDTO(any(), any())).thenReturn(creerCheminDTO());
        when(iaService.genererInterpretation(any())).thenReturn("Bon parcours");

        // WHEN
        List<CheminDTO> resultats = grapheService.trouverTousLesChemins(
                "NIVEAU_TC", "METIER_INFO", 14.0, null, null, null, null, null);

        // THEN : le chemin apparaît dans les résultats
        assertThat(resultats)
                .as("Avec une moyenne de 14/20, le chemin exigeant 12/20 doit être accessible")
                .isNotEmpty();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 6 : graphe sans arêtes → liste vide sans exception
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Aucune arête dans le graphe → liste vide retournée sans exception")
    void noeuds_non_connectes_retourne_liste_vide() throws GrapheException {
        // GIVEN : les deux nœuds existent mais aucune arête ne les relie
        when(nodeRepository.findByCode("NIVEAU_TC")).thenReturn(Optional.of(niveau));
        when(nodeRepository.findByCode("METIER_INFO")).thenReturn(Optional.of(metier));
        when(edgeRepository.findAllWithNodes()).thenReturn(List.of()); // graphe vide

        // WHEN
        List<CheminDTO> resultats = grapheService.trouverTousLesChemins(
                "NIVEAU_TC", "METIER_INFO", null, null, null, null, null, null);

        // THEN : liste vide (pas de NullPointerException, pas de crash)
        assertThat(resultats)
                .as("Sans arêtes, le BFS doit retourner une liste vide et non planter")
                .isEmpty();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Méthodes utilitaires
    // ──────────────────────────────────────────────────────────────────────────

    private Node creerNode(String id, String code, NodeType type) {
        Node node = new Node();
        node.setId(id);
        node.setCode(code);
        node.setType(type);
        node.setNomFr(code.replace("_", " "));
        node.setActif(true);
        return node;
    }

    private Edge creerEdge(String id, Node source, Node target, EdgeType typeLien) {
        Edge edge = new Edge();
        edge.setId(id);
        edge.setSource(source);
        edge.setTarget(target);
        edge.setTypeLien(typeLien);
        edge.setTauxReussite(75.0);
        edge.setTypeAcces(TypeAcces.OUVERT);
        edge.setCoutSupplementaire(0.0);
        edge.setDureeSupplementaireMois(0);
        return edge;
    }

    private CheminDTO creerCheminDTO() {
        CheminDTO dto = new CheminDTO();
        dto.setId("chemin-test");
        dto.setEtapes(List.of());
        dto.setDureeTotale(24);
        dto.setCoutTotal(5000);
        dto.setScoreComposite(0.75);
        return dto;
    }
}
