package sgpo.services.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import sgpo.entities.Edge;
import sgpo.exceptions.EdgeNotFoundException;
import sgpo.repositories.EdgeRepository;
import sgpo.services.AuditLogService;
import sgpo.services.EdgeService;

import java.util.List;

@Service
@RequiredArgsConstructor
public class EdgeServiceImpl implements EdgeService {

    private final EdgeRepository edgeRepository;
    private final AuditLogService auditLogService;

    private String getCurrentUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getName() == null || authentication.getName().isBlank()) {
            return "anonymous";
        }
        return authentication.getName();
    }

    @Override
    public List<Edge> findAll() {
        return edgeRepository.findAll();
    }

    @Override
    public Edge findById(String id) throws EdgeNotFoundException {
        return edgeRepository.findById(id)
                .orElseThrow(() -> new EdgeNotFoundException("Arête introuvable avec l'ID : " + id));
    }

    @Override
    public Edge create(Edge edge) {
        Edge saved = edgeRepository.save(edge);
        String username = getCurrentUsername();
        auditLogService.log("Edge", saved.getId(), "CREATE", username);
        return saved;
    }

    @Override
    public Edge update(String id, Edge edge) throws EdgeNotFoundException {
        Edge existing = edgeRepository.findById(id)
                .orElseThrow(() -> new EdgeNotFoundException("Arête introuvable avec l'ID : " + id));
        existing.setSource(edge.getSource());
        existing.setTarget(edge.getTarget());
        existing.setTypeLien(edge.getTypeLien());
        existing.setTauxReussite(edge.getTauxReussite());
        existing.setCoutSupplementaire(edge.getCoutSupplementaire());
        existing.setDureeSupplementaireMois(edge.getDureeSupplementaireMois());
        existing.setPrerequisNotes(edge.getPrerequisNotes());
        existing.setMoyenneMinimale(edge.getMoyenneMinimale());
        existing.setTypeAcces(edge.getTypeAcces());
        Edge updated = edgeRepository.save(existing);
        String username = getCurrentUsername();
        auditLogService.log("Edge", updated.getId(), "UPDATE", username);
        return updated;
    }

    @Override
    public void delete(String id) throws EdgeNotFoundException {
        Edge existing = edgeRepository.findById(id)
                .orElseThrow(() -> new EdgeNotFoundException("Arête introuvable avec l'ID : " + id));
        edgeRepository.delete(existing);
        String username = getCurrentUsername();
        auditLogService.log("Edge", id, "DELETE", username);
    }
}