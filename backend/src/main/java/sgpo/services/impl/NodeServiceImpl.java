package sgpo.services.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import sgpo.entities.Node;
import sgpo.exceptions.NodeNotFoundException;
import sgpo.repositories.NodeRepository;
import sgpo.services.AuditLogService;
import sgpo.services.NodeService;

import java.util.List;

@Service
@RequiredArgsConstructor
public class NodeServiceImpl implements NodeService {

    private final NodeRepository nodeRepository;
    private final AuditLogService auditLogService;

    private String getCurrentUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getName() == null || authentication.getName().isBlank()) {
            return "anonymous";
        }
        return authentication.getName();
    }

    @Override
    public List<Node> findAll() {
        return nodeRepository.findAll();
    }

    @Override
    public Node findById(String id) throws NodeNotFoundException {
        return nodeRepository.findById(id)
                .orElseThrow(() -> new NodeNotFoundException("Nœud introuvable avec l'ID : " + id));
    }

    @Override
    public Node findByCode(String code) throws NodeNotFoundException {
        return nodeRepository.findByCode(code)
                .orElseThrow(() -> new NodeNotFoundException("Nœud introuvable avec le code : " + code));
    }

    @Override
    public Node create(Node node) {
        Node saved = nodeRepository.save(node);
        String username = getCurrentUsername();
        auditLogService.log("Node", saved.getId(), "CREATE", username);
        return saved;
    }

    @Override
    public Node update(String id, Node node) throws NodeNotFoundException {
        Node existing = nodeRepository.findById(id)
                .orElseThrow(() -> new NodeNotFoundException("Nœud introuvable avec l'ID : " + id));
        existing.setType(node.getType());
        existing.setCode(node.getCode());
        existing.setNomFr(node.getNomFr());
        existing.setNomAr(node.getNomAr());
        existing.setDescription(node.getDescription());
        existing.setDureeMois(node.getDureeMois());
        existing.setCoutEstime(node.getCoutEstime());
        existing.setSecteur(node.getSecteur());
        existing.setVille(node.getVille());
        existing.setScoreIa(node.getScoreIa());
        existing.setActif(node.getActif());
        Node updated = nodeRepository.save(existing);
        String username = getCurrentUsername();
        auditLogService.log("Node", updated.getId(), "UPDATE", username);
        return updated;
    }

    @Override
    public void delete(String id) throws NodeNotFoundException {
        Node existing = nodeRepository.findById(id)
                .orElseThrow(() -> new NodeNotFoundException("Nœud introuvable avec l'ID : " + id));
        nodeRepository.delete(existing);
        String username = getCurrentUsername();
        auditLogService.log("Node", id, "DELETE", username);
    }
}
