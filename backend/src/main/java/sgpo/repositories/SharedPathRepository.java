package sgpo.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import sgpo.entities.SharedPath;

import java.util.Optional;

public interface SharedPathRepository extends JpaRepository<SharedPath, String> {
    Optional<SharedPath> findByToken(String token);
}