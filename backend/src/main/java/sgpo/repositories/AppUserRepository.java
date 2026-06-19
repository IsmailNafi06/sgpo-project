package sgpo.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import sgpo.entities.AppUser;
import java.util.Optional;

public interface AppUserRepository extends JpaRepository<AppUser, String> {
    Optional<AppUser> findByUsername(String username);
}