package sgpo.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import sgpo.dtos.CheminDTO;
import sgpo.dtos.SearchRequest;
import sgpo.exceptions.GrapheException;
import sgpo.exceptions.ShareException;
import sgpo.services.ExportService;
import sgpo.services.GrapheService;
import sgpo.services.ShareService;
import sgpo.web.ParcoursController;

import java.util.List;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ParcoursController.class)
@DisplayName("ParcoursController — Tests de l'API REST publique")
class ParcoursControllerTest {

    @Autowired private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @MockitoBean private GrapheService grapheService;
    @MockitoBean private ExportService exportService;
    @MockitoBean private ShareService shareService;
    @MockitoBean private UserDetailsService userDetailsService;

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 1 : generate → 200 avec résultats
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("POST /api/parcours/generate → 200 OK avec liste de parcours")
    void generate_retourne_200_avec_resultats() throws Exception {
        // GIVEN : le service retourne un chemin
        CheminDTO chemin = new CheminDTO();
        chemin.setId("chemin-1");
        chemin.setEtapes(List.of());
        chemin.setDureeTotale(72);
        chemin.setCoutTotal(50000);
        chemin.setScoreComposite(0.8);

        when(grapheService.trouverTousLesChemins(any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(List.of(chemin));

        SearchRequest request = new SearchRequest();
        request.setCodeDepart("NIVEAU_TC");
        request.setCodeArrivee("MEDECIN_GENERALISTE");

        // WHEN + THEN
        mockMvc.perform(post("/api/parcours/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].id").value("chemin-1"))
                .andExpect(jsonPath("$[0].dureeTotale").value(72));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 2 : generate avec code inexistant → 400
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("POST /api/parcours/generate avec code inexistant → 400 Bad Request")
    void generate_code_inexistant_retourne_400() throws Exception {
        // GIVEN : le service lève une GrapheException
        when(grapheService.trouverTousLesChemins(any(), any(), any(), any(), any(), any(), any(), any()))
                .thenThrow(new GrapheException("Niveau de départ introuvable : CODE_BIDON"));

        SearchRequest request = new SearchRequest();
        request.setCodeDepart("CODE_BIDON");
        request.setCodeArrivee("METIER_BIDON");

        // WHEN + THEN : le contrôleur transforme l'exception en 400
        mockMvc.perform(post("/api/parcours/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 3 : share → 200 avec lien
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("POST /api/parcours/share → 200 OK avec lien de partage")
    void share_retourne_lien_de_partage() throws Exception {
        // GIVEN
        CheminDTO chemin = new CheminDTO();
        chemin.setId("chemin-1");
        chemin.setEtapes(List.of());

        when(shareService.createShareLink(any())).thenReturn("http://localhost/shared/abc12345");

        // WHEN + THEN
        mockMvc.perform(post("/api/parcours/share")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(chemin)))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("abc12345")));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 4 : shared token valide → 200 avec parcours
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("GET /api/parcours/shared/{token} valide → 200 OK avec parcours")
    void shared_token_valide_retourne_parcours() throws Exception {
        // GIVEN
        CheminDTO chemin = new CheminDTO();
        chemin.setId("chemin-partage");
        chemin.setEtapes(List.of());

        when(shareService.getSharedPath("abc12345")).thenReturn(chemin);

        // WHEN + THEN
        mockMvc.perform(get("/api/parcours/shared/abc12345"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("chemin-partage"));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 5 : shared token invalide → 404
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("GET /api/parcours/shared/{token} invalide → 404 Not Found")
    void shared_token_invalide_retourne_404() throws Exception {
        // GIVEN : le token n'existe pas
        when(shareService.getSharedPath("token-invalide"))
                .thenThrow(new ShareException("Token introuvable"));

        // WHEN + THEN
        mockMvc.perform(get("/api/parcours/shared/token-invalide"))
                .andExpect(status().isNotFound());
    }
}
