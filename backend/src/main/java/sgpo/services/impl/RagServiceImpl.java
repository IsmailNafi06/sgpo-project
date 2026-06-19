package sgpo.services.impl;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;
import sgpo.services.RagService;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class RagServiceImpl implements RagService {

    private final VectorStore vectorStore;
    private final ChatClient chatClient;

    public RagServiceImpl(VectorStore vectorStore, ChatClient.Builder chatClientBuilder) {
        this.vectorStore = vectorStore;
        this.chatClient = chatClientBuilder.build();
    }

    @Override
    public String askLLM(String queryForEmbedding, String promptGPT) {
        // Recherche sémantique avec la requête COURTE (builder)
        List<Document> documents = vectorStore.similaritySearch(
                SearchRequest.builder()
                        .query(queryForEmbedding)
                        .topK(6)
                        .build()
        );

        String contexte = documents.stream()
                .map(Document::getText)
                .collect(Collectors.joining("\n\n"));

        String systemMessage = """
        Tu es un conseiller d'orientation expert du système éducatif marocain.
        Rédige une réponse naturelle, humaine et encourageante pour l'élève.
        Si le contexte ci-dessous contient des témoignages ou des métiers connexes,
        tu peux les intégrer spontanément. S'il est pauvre, appuie-toi sur ta
        connaissance générale du métier pour donner des conseils utiles.
    
        CONTEXTE :
        %s
        """.formatted(contexte);

        return chatClient.prompt()
                .system(systemMessage)
                .user(promptGPT)
                .call()
                .content();
    }
}
