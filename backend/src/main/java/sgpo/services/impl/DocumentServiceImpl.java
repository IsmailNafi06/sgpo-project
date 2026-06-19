package sgpo.services.impl;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.document.Document;
import org.springframework.ai.transformer.splitter.TokenTextSplitter;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;
import sgpo.services.DocumentService;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class DocumentServiceImpl implements DocumentService {
    private final VectorStore vectorStore;

    @Override
    public void ingestText(String metierCode, String texte) {
        Document document = new Document(texte, Map.of("metier_code", metierCode));
        TokenTextSplitter splitter = TokenTextSplitter.builder()
                .withChunkSize(800)
                .withMinChunkSizeChars(200)
                .withMinChunkLengthToEmbed(10)
                .withMaxNumChunks(5000)
                .withKeepSeparator(true)
                .build();
        List<Document> chunks = splitter.split(List.of(document));
        vectorStore.add(chunks);
        log.info("📝 Document ingéré pour le métier {} : {} chunks créés.", metierCode, chunks.size());
    }
}
