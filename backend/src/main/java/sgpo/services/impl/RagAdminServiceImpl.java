package sgpo.services.impl;

import com.opencsv.CSVReader;
import com.opencsv.exceptions.CsvValidationException;
import lombok.RequiredArgsConstructor;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import sgpo.services.DocumentService;
import sgpo.services.RagAdminService;

import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

@Service
@RequiredArgsConstructor
public class RagAdminServiceImpl implements RagAdminService {

    private final DocumentService documentService;

    @Override
    public String uploadAndIngestDocument(MultipartFile file) throws Exception {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Le fichier est vide.");
        }

        String filename = safeFilename(file.getOriginalFilename());
        String extension = extensionOf(filename);
        String extractedText = switch (extension) {
            case "txt" -> extractTxt(file);
            case "pdf" -> extractPdf(file);
            case "csv" -> extractCsv(file);
            default -> throw new IllegalArgumentException("Format non supporte. Formats acceptes : TXT, PDF, CSV.");
        };

        if (extractedText == null || extractedText.trim().isEmpty()) {
            throw new IllegalArgumentException("Aucun texte exploitable n'a ete trouve dans le fichier.");
        }

        String documentCode = stripExtension(filename);
        documentService.ingestText(documentCode, extractedText);

        return "Document RAG importe avec succes : " + extractedText.length() + " caracteres ingeres.";
    }

    private String extractTxt(MultipartFile file) throws IOException {
        return new String(file.getBytes(), StandardCharsets.UTF_8);
    }

    private String extractPdf(MultipartFile file) throws IOException {
        try (PDDocument document = Loader.loadPDF(file.getBytes())) {
            return new PDFTextStripper().getText(document);
        }
    }

    private String extractCsv(MultipartFile file) throws IOException, CsvValidationException {
        List<String> lines = new ArrayList<>();
        try (CSVReader reader = new CSVReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String[] firstRow = reader.readNext();
            if (firstRow == null) return "";

            String[] row;
            int lineNumber = 1;
            boolean hasDataRows = false;
            while ((row = reader.readNext()) != null) {
                hasDataRows = true;
                String sentence = csvRowToSentence(firstRow, row, lineNumber);
                if (!sentence.isBlank()) {
                    lines.add(sentence);
                }
                lineNumber++;
            }

            if (!hasDataRows) {
                String[] genericHeaders = IntStream.range(0, firstRow.length)
                        .mapToObj(index -> "champ " + (index + 1))
                        .toArray(String[]::new);
                String sentence = csvRowToSentence(genericHeaders, firstRow, 1);
                if (!sentence.isBlank()) {
                    lines.add(sentence);
                }
            }
        }
        return String.join("\n", lines);
    }

    private String csvRowToSentence(String[] headers, String[] row, int lineNumber) {
        String content = IntStream.range(0, row.length)
                .mapToObj(index -> {
                    String value = row[index] == null ? "" : row[index].trim();
                    if (value.isEmpty()) return "";
                    String header = index < headers.length && headers[index] != null && !headers[index].isBlank()
                            ? headers[index].trim()
                            : "champ " + (index + 1);
                    return header + " : " + value;
                })
                .filter(part -> !part.isBlank())
                .collect(Collectors.joining(", "));
        return content.isBlank() ? "" : "Ligne " + lineNumber + " du document : " + content + ".";
    }

    private String safeFilename(String originalFilename) {
        String filename = originalFilename == null ? "document" : originalFilename.replace("\\", "/");
        filename = filename.substring(filename.lastIndexOf('/') + 1).trim();
        return filename.isBlank() ? "document" : filename;
    }

    private String extensionOf(String filename) {
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot == filename.length() - 1) return "";
        return filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private String stripExtension(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot > 0 ? filename.substring(0, dot) : filename;
    }
}
