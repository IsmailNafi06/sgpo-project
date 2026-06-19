package sgpo.services;

import sgpo.entities.AuditLog;

import java.util.List;

public interface AuditLogService {
    void log(String entityType, String entityId, String action, String modifiedBy);
    List<AuditLog> findAll();
}