package sgpo.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import sgpo.entities.Node;
import sgpo.enums.NodeType;
import sgpo.exceptions.NodeNotFoundException;
import sgpo.security.SecurityConfig;
import sgpo.services.NodeService;
import sgpo.web.NodeAdminController;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(NodeAdminController.class)
@Import(SecurityConfig.class)
@DisplayName("NodeAdminController — Tests CRUD et sécurité")
class NodeAdminControllerTest {

    @Autowired private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @MockitoBean private NodeService nodeService;
    @MockitoBean private UserDetailsService userDetailsService;

    private Node nodeTest;

    @BeforeEach
    void setUp() {
        nodeTest = new Node();
        nodeTest.setId("node-1");
        nodeTest.setCode("NIVEAU_TC");
        nodeTest.setType(NodeType.NIVEAU);
        nodeTest.setNomFr("Tronc Commun");
        nodeTest.setActif(true);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 1 : sans token → 401 Unauthorized
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("GET /api/admin/nodes sans token → 401 Unauthorized")
    void get_nodes_sans_token_retourne_401() throws Exception {
        // WHEN : requête sans aucun token d'authentification
        mockMvc.perform(get("/api/admin/nodes"))
                // THEN : accès refusé (non authentifié)
                .andExpect(status().isUnauthorized());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 2 : avec rôle ADMIN → 200 OK
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("GET /api/admin/nodes avec rôle ADMIN → 200 OK avec liste")
    void get_nodes_avec_admin_retourne_200() throws Exception {
        // GIVEN
        when(nodeService.findAll()).thenReturn(List.of(nodeTest));

        // WHEN : requête avec un JWT simulé contenant ROLE_ADMIN
        mockMvc.perform(get("/api/admin/nodes")
                        .with(jwt().authorities(
                                new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_ADMIN"))))
                // THEN
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].code").value("NIVEAU_TC"))
                .andExpect(jsonPath("$[0].id").value("node-1"));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 3 : créer un nœud → 200 avec le nœud créé
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("POST /api/admin/nodes avec rôle ADMIN → 200 OK avec nœud créé")
    void create_node_retourne_node_cree() throws Exception {
        // GIVEN
        when(nodeService.create(any())).thenReturn(nodeTest);

        // WHEN
        mockMvc.perform(post("/api/admin/nodes")
                        .with(jwt().authorities(
                                new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(nodeTest)))
                // THEN : le nœud créé est retourné
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("node-1"))
                .andExpect(jsonPath("$.code").value("NIVEAU_TC"));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 4 : supprimer un nœud inexistant → 404
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("DELETE /api/admin/nodes/{id} inexistant → 404 Not Found")
    void delete_node_inexistant_retourne_404() throws Exception {
        // GIVEN : le service lève NodeNotFoundException
        doThrow(new NodeNotFoundException("node-inexistant")).when(nodeService).delete("node-inexistant");

        // WHEN
        mockMvc.perform(delete("/api/admin/nodes/node-inexistant")
                        .with(jwt().authorities(
                                new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_ADMIN"))))
                // THEN
                .andExpect(status().isNotFound());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 5 : rôle insuffisant → 403 Forbidden
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("GET /api/admin/nodes avec rôle USER → 403 Forbidden")
    void get_nodes_avec_user_retourne_403() throws Exception {
        // WHEN : connecté mais pas ADMIN
        mockMvc.perform(get("/api/admin/nodes")
                        .with(jwt().authorities(
                                new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_USER"))))
                // THEN : accès refusé (authentifié mais pas autorisé)
                .andExpect(status().isForbidden());
    }
}
