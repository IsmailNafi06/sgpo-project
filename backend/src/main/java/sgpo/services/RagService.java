package sgpo.services;

public interface RagService {
    String askLLM(String queryForEmbedding, String promptGPT);
}
