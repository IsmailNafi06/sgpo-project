package sgpo.services.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import sgpo.repositories.EdgeRepository;
import sgpo.repositories.NodeRepository;
import sgpo.services.DashboardService;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class DashboardServiceImpl implements DashboardService {

    private final NodeRepository nodeRepository;
    private final EdgeRepository edgeRepository;

    @Override
    public Map<String, Object> getQualityStats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalNodes", nodeRepository.count());
        stats.put("totalEdges", edgeRepository.count());
        stats.put("nodesByType", nodeRepository.countByType());
        stats.put("edgesByType", edgeRepository.countByTypeLien());
        stats.put("nodesWithoutDescription", nodeRepository.countByDescriptionIsNullOrEmpty());
        stats.put("orphanEdges", edgeRepository.countOrphanEdges());
        return stats;
    }
}