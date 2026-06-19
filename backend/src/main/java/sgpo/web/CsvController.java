package sgpo.web;

import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import sgpo.exceptions.CsvException;
import sgpo.services.CsvService;

import java.io.ByteArrayInputStream;

@RestController
@RequestMapping("/api/admin/csv")
@RequiredArgsConstructor
public class CsvController {

    private final CsvService csvService;

    @GetMapping("/export/nodes")
    public ResponseEntity<InputStreamResource> exportNodes() throws CsvException {
        ByteArrayInputStream stream = csvService.exportNodes();
        HttpHeaders headers = new HttpHeaders();
        headers.add("Content-Disposition", "attachment; filename=nodes.csv");
        return ResponseEntity.ok()
                .headers(headers)
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(new InputStreamResource(stream));
    }

    @PostMapping("/import/nodes")
    public ResponseEntity<String> importNodes(@RequestParam("file") MultipartFile file) {
        try {
            csvService.importNodes(file);
            return ResponseEntity.ok("Import réussi.");
        } catch (CsvException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @GetMapping("/export/edges")
    public ResponseEntity<InputStreamResource> exportEdges() throws CsvException {
        ByteArrayInputStream stream = csvService.exportEdges();
        HttpHeaders headers = new HttpHeaders();
        headers.add("Content-Disposition", "attachment; filename=edges.csv");
        return ResponseEntity.ok()
                .headers(headers)
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(new InputStreamResource(stream));
    }

    @PostMapping("/import/edges")
    public ResponseEntity<String> importEdges(@RequestParam("file") MultipartFile file) {
        try {
            csvService.importEdges(file);
            return ResponseEntity.ok("Import des arêtes réussi.");
        } catch (CsvException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
}