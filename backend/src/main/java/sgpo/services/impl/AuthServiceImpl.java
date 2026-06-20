package sgpo.services.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import sgpo.entities.AppUser;
import sgpo.repositories.AppUserRepository;
import sgpo.services.AuthService;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private final AuthenticationManager authenticationManager;
    private final JwtEncoder jwtEncoder;
    private final AppUserRepository appUserRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public String authenticate(String username, String password) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(username, password)
        );

        String roles = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.joining(" "));

        AppUser appUser = appUserRepository.findByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Utilisateur introuvable."));

        return generateToken(username, roles, appUser.isPasswordMustChange());
    }

    @Override
    public Map<String, String> changePassword(String username, String oldPassword, String newPassword) {
        if (username == null || username.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentification requise.");
        }

        if (oldPassword == null || oldPassword.isBlank() || newPassword == null || newPassword.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ancien et nouveau mots de passe requis.");
        }

        AppUser appUser = appUserRepository.findByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Utilisateur introuvable."));

        if (!passwordEncoder.matches(oldPassword, appUser.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ancien mot de passe incorrect.");
        }

        appUser.setPasswordHash(passwordEncoder.encode(newPassword));
        appUser.setPasswordMustChange(false);
        appUserRepository.save(appUser);

        String newJwt = generateToken(appUser.getUsername(), "ROLE_" + appUser.getRole(), null);
        return Map.of(
                "access-token", newJwt,
                "message", "Mot de passe mis a jour avec succes."
        );
    }

    @Override
    public void createAdmin(String username, String password) {
        if (username == null || username.isBlank() || password == null || password.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Identifiant et mot de passe requis.");
        }
        if (password.length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le mot de passe doit contenir au moins 8 caracteres.");
        }
        if (appUserRepository.findByUsername(username).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Un administrateur avec cet identifiant existe deja.");
        }
        AppUser admin = new AppUser();
        admin.setUsername(username);
        admin.setPasswordHash(passwordEncoder.encode(password));
        admin.setRole("ADMIN");
        admin.setEnabled(true);
        admin.setPasswordMustChange(true);
        appUserRepository.save(admin);
    }

    private String generateToken(String username, String roles, Boolean mustChangePassword) {
        Instant now = Instant.now();
        JwtClaimsSet.Builder claimsBuilder = JwtClaimsSet.builder()
                .issuedAt(now)
                .expiresAt(now.plus(8, ChronoUnit.HOURS))
                .subject(username)
                .claim("roles", roles);

        if (mustChangePassword != null) {
            claimsBuilder.claim("mustChangePassword", mustChangePassword);
        }

        JwtEncoderParameters parameters = JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS512).build(),
                claimsBuilder.build()
        );

        return jwtEncoder.encode(parameters).getTokenValue();
    }
}
