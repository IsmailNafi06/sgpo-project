package sgpo;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.security.crypto.password.PasswordEncoder;
import sgpo.entities.AppUser;
import sgpo.exceptions.DataImportException;
import sgpo.repositories.AppUserRepository;
import sgpo.services.DataImportService;

@Slf4j
@SpringBootApplication
public class SgpoApplication {

    public static void main(String[] args) {
        SpringApplication.run(SgpoApplication.class, args);
    }

    //@Bean
    CommandLineRunner initDatabase(DataImportService dataImportService) {
        return args -> {
            log.info("Demarrage de l'import initial...");
            try {
                dataImportService.importAllData();
                log.info("Import initial termine.");
            } catch (DataImportException e) {
                log.error("Echec de l'import initial : {}", e.getMessage(), e);
            }
        };
    }

    @Bean
    @ConditionalOnProperty(prefix = "app", name = "bootstrap-admin", havingValue = "true", matchIfMissing = true)
    CommandLineRunner initAdmin(AppUserRepository appUserRepository, PasswordEncoder passwordEncoder) {
        return args -> {
            String adminUsername = System.getenv().getOrDefault("ADMIN_USERNAME", "admin");

            if (appUserRepository.findByUsername(adminUsername).isEmpty()) {
                String adminPassword = System.getenv("ADMIN_PASSWORD");
                if (adminPassword == null || adminPassword.isBlank()) {
                    throw new IllegalStateException("ADMIN_PASSWORD n'est pas définie. Veuillez la définir pour créer l'administrateur.");
                }

                AppUser admin = new AppUser();
                admin.setUsername(adminUsername);
                admin.setPasswordHash(passwordEncoder.encode(adminPassword));
                admin.setRole("ADMIN");
                admin.setEnabled(true);
                admin.setPasswordMustChange(true);
                appUserRepository.save(admin);
                log.info("Admin créé avec succès. Vous pouvez maintenant désactiver app.bootstrap-admin.");
            }

        };
    }
}
