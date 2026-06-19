package sgpo.web;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import sgpo.dtos.MetierPublicDTO;
import sgpo.services.PublicService;

import java.util.List;

@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
public class PublicController {

    private final PublicService publicService;

    @GetMapping("/metiers")
    public ResponseEntity<List<MetierPublicDTO>> getMetiersActifs() {
        return ResponseEntity.ok(publicService.getMetiersActifs());
    }
}

