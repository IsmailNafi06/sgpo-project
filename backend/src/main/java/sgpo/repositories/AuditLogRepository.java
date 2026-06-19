package sgpo.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import sgpo.entities.AuditLog;

public interface AuditLogRepository extends JpaRepository<AuditLog, String> {
}