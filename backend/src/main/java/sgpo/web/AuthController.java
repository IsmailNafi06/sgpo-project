package sgpo.web;

import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import sgpo.services.AuthService;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public Map<String, String> login(@RequestBody Map<String, String> credentials) {
        String accessToken = authService.authenticate(credentials.get("username"), credentials.get("password"));
        return Map.of("access-token", accessToken);
    }

    @PostMapping("/change-password")
    public Map<String, String> changePassword(
            @RequestBody Map<String, String> payload,
            @org.springframework.security.core.annotation.AuthenticationPrincipal Jwt jwt
    ) {
        String username = jwt == null ? null : jwt.getSubject();
        return authService.changePassword(
                username,
                payload.get("oldPassword"),
                payload.get("newPassword")
        );
    }
}
