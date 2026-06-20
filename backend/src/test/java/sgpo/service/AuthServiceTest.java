package sgpo.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.web.server.ResponseStatusException;
import sgpo.entities.AppUser;
import sgpo.repositories.AppUserRepository;
import sgpo.services.AuditLogService;
import sgpo.services.impl.AuthServiceImpl;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("AuthService — Tests d'authentification")
class AuthServiceTest {

    @Mock private AuthenticationManager authenticationManager;
    @Mock private JwtEncoder jwtEncoder;
    @Mock private AppUserRepository appUserRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private AuditLogService auditLogService;

    @InjectMocks
    private AuthServiceImpl authService;

    private AppUser adminUser;

    @BeforeEach
    void setUp() {
        adminUser = new AppUser();
        adminUser.setUsername("admin");
        adminUser.setPasswordHash("$2a$10$hashedpassword");
        adminUser.setRole("ADMIN");
        adminUser.setEnabled(true);
        adminUser.setPasswordMustChange(false);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 1 : login correct → token JWT retourné
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Login correct → token JWT retourné")
    void login_correct_retourne_token() {
        // GIVEN : l'authenticationManager accepte les credentials
        Authentication auth = mock(Authentication.class);
        doReturn(List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))).when(auth).getAuthorities();
        when(authenticationManager.authenticate(any())).thenReturn(auth);
        when(appUserRepository.findByUsername("admin")).thenReturn(Optional.of(adminUser));

        // GIVEN : le jwtEncoder retourne un faux token
        Jwt jwt = mock(Jwt.class);
        when(jwtEncoder.encode(any())).thenReturn(jwt);
        when(jwt.getTokenValue()).thenReturn("fake.jwt.token");

        // WHEN
        String token = authService.authenticate("admin", "password123");

        // THEN : le token est bien retourné
        assertThat(token).isEqualTo("fake.jwt.token");
        verify(authenticationManager, times(1)).authenticate(any());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 2 : mauvais mot de passe → exception
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Mauvais mot de passe → BadCredentialsException propagée")
    void mauvais_password_leve_exception() {
        // GIVEN : l'authenticationManager rejette les credentials
        when(authenticationManager.authenticate(any()))
                .thenThrow(new BadCredentialsException("Mot de passe incorrect"));

        // WHEN + THEN : l'exception est propagée telle quelle
        assertThatThrownBy(() -> authService.authenticate("admin", "mauvais-mdp"))
                .isInstanceOf(BadCredentialsException.class);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 3 : changement de mot de passe correct → nouveau token
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Changement de mot de passe correct → succès avec nouveau token")
    void changement_password_correct() {
        // GIVEN
        when(appUserRepository.findByUsername("admin")).thenReturn(Optional.of(adminUser));
        when(passwordEncoder.matches("ancienMdp", adminUser.getPasswordHash())).thenReturn(true);
        when(passwordEncoder.encode("nouveauMdp")).thenReturn("$2a$10$newhashed");

        Jwt jwt = mock(Jwt.class);
        when(jwtEncoder.encode(any())).thenReturn(jwt);
        when(jwt.getTokenValue()).thenReturn("nouveau.jwt.token");

        // WHEN
        Map<String, String> result = authService.changePassword("admin", "ancienMdp", "nouveauMdp");

        // THEN : le résultat contient le nouveau token
        assertThat(result).containsKey("access-token");
        assertThat(result.get("access-token")).isEqualTo("nouveau.jwt.token");

        // THEN : le mot de passe est bien sauvegardé en base
        verify(appUserRepository, times(1)).save(adminUser);

        // THEN : le flag "doit changer" est bien désactivé
        assertThat(adminUser.isPasswordMustChange()).isFalse();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 4 : ancien mot de passe incorrect → erreur 400
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Ancien mot de passe incorrect → ResponseStatusException 400")
    void ancien_password_incorrect_leve_exception() {
        // GIVEN : le passwordEncoder dit que l'ancien mdp ne correspond pas
        when(appUserRepository.findByUsername("admin")).thenReturn(Optional.of(adminUser));
        when(passwordEncoder.matches("mauvaisAncien", adminUser.getPasswordHash())).thenReturn(false);

        // WHEN + THEN : erreur 400 Bad Request
        assertThatThrownBy(() -> authService.changePassword("admin", "mauvaisAncien", "nouveauMdp"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");

        // THEN : rien n'a été sauvegardé
        verify(appUserRepository, never()).save(any());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 5 : création d'admin correct → sauvegardé en base
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Création admin correct → admin sauvegardé avec passwordMustChange=true")
    void create_admin_succes() {
        // GIVEN : le username n'existe pas encore
        when(appUserRepository.findByUsername("admin2")).thenReturn(Optional.empty());
        when(passwordEncoder.encode("motdepasse123")).thenReturn("$2a$10$hashed");

        // WHEN
        authService.createAdmin("admin2", "motdepasse123");

        // THEN : le nouvel admin est bien sauvegardé
        verify(appUserRepository, times(1)).save(argThat(user ->
                user.getUsername().equals("admin2") &&
                user.getRole().equals("ADMIN") &&
                user.isPasswordMustChange() &&
                user.isEnabled()
        ));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 6 : username déjà pris → 409 Conflict
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Création admin avec username existant → ResponseStatusException 409")
    void create_admin_username_existant_leve_exception() {
        // GIVEN : le username existe déjà
        when(appUserRepository.findByUsername("admin")).thenReturn(Optional.of(adminUser));

        // WHEN + THEN : conflit détecté
        assertThatThrownBy(() -> authService.createAdmin("admin", "motdepasse123"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");

        // THEN : aucune sauvegarde
        verify(appUserRepository, never()).save(any());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 7 : mot de passe trop court → 400 Bad Request
    // ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Création admin avec mot de passe trop court → ResponseStatusException 400")
    void create_admin_password_trop_court_leve_exception() {
        // WHEN + THEN : mot de passe de 4 chars → rejeté avant même de consulter la base
        assertThatThrownBy(() -> authService.createAdmin("admin2", "1234"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");

        // THEN : aucune sauvegarde
        verify(appUserRepository, never()).save(any());
    }
}
