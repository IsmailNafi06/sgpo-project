package sgpo.services.impl;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import sgpo.dtos.EdgeImportDto;
import sgpo.entities.Edge;
import sgpo.entities.Node;
import sgpo.exceptions.DataImportException;
import sgpo.mappers.impl.EdgeMapperImpl;
import sgpo.repositories.EdgeRepository;
import sgpo.repositories.NodeRepository;
import sgpo.services.DataImportService;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class DataImportServiceImpl implements DataImportService {

    private final NodeRepository nodeRepository;
    private final EdgeRepository edgeRepository;
    private final ObjectMapper objectMapper;
    private final EdgeMapperImpl edgeMapper;

    @Override
    public void importAllData() throws DataImportException {
        // Nettoyer la base avant import
        edgeRepository.deleteAll();
        nodeRepository.deleteAll();

        Map<String, Node> nodeIndex = importNodes();
        importEdges(nodeIndex);
    }

    private Map<String, Node> importNodes() throws DataImportException {
        InputStream stream = getClass().getResourceAsStream("/data/nodes_all.json");
        if (stream == null) throw new DataImportException("Fichier nodes_all.json introuvable");

        try {
            List<Node> nodes = objectMapper.readValue(stream, new TypeReference<List<Node>>() {});
            nodeRepository.saveAll(nodes);
            log.info("✅ Importé {} nœuds.", nodes.size());
            return nodes.stream().collect(Collectors.toMap(Node::getId, Function.identity()));
        } catch (Exception e) {
            throw new DataImportException("Erreur lors de l'import des nœuds : " + e.getMessage());
        }
    }

    private void importEdges(Map<String, Node> nodeIndex) throws DataImportException {
        InputStream stream = getClass().getResourceAsStream("/data/edges.json");
        if (stream == null) throw new DataImportException("Fichier edges.json introuvable");

        try {
            List<EdgeImportDto> dtoList = objectMapper.readValue(stream, new TypeReference<List<EdgeImportDto>>() {});
            List<Edge> edges = dtoList.stream()
                    .map(dto -> edgeMapper.toEntity(dto, nodeIndex))
                    .collect(Collectors.toList());
            edgeRepository.saveAll(edges);
            log.info("✅ Importé {} arêtes.", edges.size());
        } catch (Exception e) {
            throw new DataImportException("Erreur lors de l'import des arêtes : " + e.getMessage());
        }
    }
}