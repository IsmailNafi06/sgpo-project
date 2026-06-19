package sgpo.web;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import sgpo.dtos.CheminDTO;
import sgpo.dtos.SearchRequest;
import sgpo.exceptions.ExportException;
import sgpo.exceptions.GrapheException;
import sgpo.exceptions.ShareException;
import sgpo.services.ExportService;
import sgpo.services.GrapheService;
import sgpo.services.ShareService;

import java.util.List;

@RestController
@RequestMapping("/api/parcours")
@RequiredArgsConstructor
@Slf4j
public class ParcoursController {

    private final GrapheService grapheService;
    private final ExportService exportService;
    private final ShareService shareService;

    @PostMapping("/generate")
    public ResponseEntity<?> generate(@RequestBody SearchRequest request) throws GrapheException {
        try {
            List<CheminDTO> chemins = grapheService.trouverTousLesChemins(
                    request.getCodeDepart(),
                    request.getCodeArrivee(),
                    request.getMoyenne(),
                    request.getMobilite(),
                    request.getVilleDepart(),
                    request.getDureeMax(),
                    request.getCoutMax(),
                    request.getTypeAccesFiltre()
            );
            return ResponseEntity.ok(chemins);
        } catch (GrapheException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (Exception e) {
            log.error("Erreur inattendue", e);
            return ResponseEntity.status(500).body("Erreur interne : " + e.getMessage());
        }
    }

    @PostMapping("/export")
    public ResponseEntity<byte[]> exportParcours(@RequestBody CheminDTO chemin) {
        try {
            byte[] pdfBytes = exportService.generatePdf(chemin);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDisposition(ContentDisposition.attachment().filename("parcours.pdf").build());
            return new ResponseEntity<>(pdfBytes, headers, HttpStatus.OK);
        } catch (ExportException e) {
            return ResponseEntity.internalServerError().body(null);
        }
    }

    @PostMapping("/share")
    public ResponseEntity<String> shareParcours(@RequestBody CheminDTO chemin) {
        try {
            String shareLink = shareService.createShareLink(chemin);
            return ResponseEntity.ok(shareLink);
        } catch (ShareException e) {
            return ResponseEntity.internalServerError().body("Erreur lors du partage.");
        }
    }

    @GetMapping("/shared/{token}")
    public ResponseEntity<CheminDTO> getSharedParcours(@PathVariable String token) {
        try {
            CheminDTO chemin = shareService.getSharedPath(token);
            return ResponseEntity.ok(chemin);
        } catch (ShareException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
