package sgpo.services.impl;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import sgpo.dtos.CheminDTO;
import sgpo.entities.SharedPath;
import sgpo.exceptions.ShareException;
import sgpo.repositories.SharedPathRepository;
import sgpo.services.ShareService;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Service
@RequiredArgsConstructor
public class ShareServiceImpl implements ShareService {
    private final SharedPathRepository sharedPathRepository;
    private final ObjectMapper objectMapper;
    @Value("${app.public-url:http://localhost:5173}")
    private String publicBaseUrl;

    @Override
    public String createShareLink(CheminDTO chemin) throws ShareException {
        try {
            String cheminJson = objectMapper.writeValueAsString(chemin);

            SharedPath sharedPath = new SharedPath();
            sharedPath.setCheminJson(cheminJson);
            sharedPathRepository.save(sharedPath);

            // Construire l'URL de partage pour le FRONTEND
            String baseUrl = publicBaseUrl != null ? publicBaseUrl.replaceAll("/+$", "") : "http://localhost:5173";
            return baseUrl + "/shared/" + sharedPath.getToken();   // <-- plus de /api/parcours
        } catch (Exception e) {
            log.error("Erreur lors de la création du lien de partage", e);
            throw new ShareException("Erreur lors du partage : " + e.getMessage());
        }
    }
    @Override
    public CheminDTO getSharedPath(String token) throws ShareException {
        SharedPath sharedPath = sharedPathRepository.findByToken(token)
                .orElseThrow(() -> new ShareException("Lien de partage introuvable."));

        try {
            // Reconvertir le JSON en CheminDTO
            return objectMapper.readValue(sharedPath.getCheminJson(), CheminDTO.class);
        } catch (Exception e) {
            throw new ShareException("Erreur lors de la lecture du chemin partagé.");
        }
    }
}
