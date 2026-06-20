package sgpo.web;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import sgpo.services.AuthService;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/users")
@RequiredArgsConstructor
public class UserAdminController {

    private final AuthService authService;

    @PostMapping
    public ResponseEntity<Map<String, String>> createAdmin(@RequestBody Map<String, String> payload) {
        authService.createAdmin(payload.get("username"), payload.get("password"));
        return ResponseEntity.ok(Map.of("message", "Administrateur cree avec succes."));
    }
}
