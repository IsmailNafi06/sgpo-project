package sgpo.services.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import sgpo.dtos.CheminDTO;
import sgpo.services.IAService;
import sgpo.services.RagService;

import java.util.stream.Collectors;

@RequiredArgsConstructor
@Service
public class IAServiceImpl implements IAService {
    private final RagService ragService;

    @Override
    public String genererInterpretation(CheminDTO chemin) {
        String metier = chemin.getEtapes().get(chemin.getEtapes().size() - 1).getNom();

        // 1. Requête de recherche (COURTE et CIBLÉE pour pgvector)
        String questionRAG = "Témoignages, débouchés et métiers connexes pour le métier de " + metier + " au Maroc";

        // 2. Requête de génération (COMPLÈTE pour le LLM)
        String etapesStr = chemin.getEtapes().stream()
                .map(e -> "- " + e.getNom() + " (" + e.getDuree() + " mois)")
                .collect(Collectors.joining("\n"));

        String promptGPT = """
            Voici le parcours pour devenir %s :
            %s

            Durée totale : %d mois.

            Parle à cet élève comme le ferait un conseiller d'orientation bienveillant.
            Explique-lui simplement ce parcours, donne-lui des conseils et, si tu as des
            informations sur des témoignages d'anciens élèves ou des métiers proches,
            partage-les naturellement. Reste fluide et humain.
            """.formatted(metier, etapesStr, chemin.getDureeTotale());

        // 3. Appeler le RAG avec les DEUX paramètres distincts
        return ragService.askLLM(questionRAG, promptGPT);
    }
}
