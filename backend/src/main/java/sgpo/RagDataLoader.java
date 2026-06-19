package sgpo;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;
import sgpo.services.DocumentService;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.stream.Collectors;

//@Component
//@RequiredArgsConstructor
//@Slf4j
//public class RagDataLoader implements CommandLineRunner {
//
//    private final DocumentService documentService;
//
//    @Override
//    public void run(String... args) {
//         log.info("🚀 RagDataLoader démarré...");
//         try {
//             PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
//             Resource[] resources = resolver.getResources("classpath:/data_rag/**/*.txt");
//             log.info("📂 {} fichiers trouvés dans data_rag.", resources.length);
//
//             int count = 0;
//             for (Resource resource : resources) {
//                 String filename = resource.getFilename();
//                 if (filename == null) continue;
//
//                 String content = new BufferedReader(
//                         new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))
//                         .lines()
//                         .collect(Collectors.joining("\n"));
//
//                 String metierCode = filename
//                         .replace(".txt", "")
//                         .replaceAll("[\\s-]+", "_")
//                         .replaceAll("[^A-Za-z0-9_]", "")
//                         .toUpperCase();
//
//                 documentService.ingestText(metierCode, content);
//                 count++;
//             }
//             log.info("{} documents ingérés depuis data_rag.", count);
//         } catch (Exception e) {
//             log.warn("⚠️ Erreur lors de l'ingestion des documents RAG : {}", e.getMessage());
//         }
//    }
//}