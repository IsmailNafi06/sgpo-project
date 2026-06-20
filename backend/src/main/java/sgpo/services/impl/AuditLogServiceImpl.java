package sgpo.services.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import sgpo.entities.AuditLog;
import sgpo.repositories.AuditLogRepository;
import sgpo.services.AuditLogService;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AuditLogServiceImpl implements AuditLogService {

    private final AuditLogRepository auditLogRepository;

    @Override
    public void log(String entityType, String entityId, String action, String modifiedBy) {
        log(entityType, entityId, action, modifiedBy, null);
    }

    @Override
    public void log(String entityType, String entityId, String action, String modifiedBy, String message) {
        AuditLog log = new AuditLog();
        log.setEntityType(entityType);
        log.setEntityId(entityId);
        log.setAction(action);
        log.setModifiedBy(modifiedBy);
        log.setMessage(message);
        auditLogRepository.save(log);
    }

    @Override
    public List<AuditLog> findAll() {
        return auditLogRepository.findAll();
    }
}