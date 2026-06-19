package sgpo.mappers;

import sgpo.dtos.EdgeImportDto;
import sgpo.entities.Edge;
import sgpo.entities.Node;

import java.util.Map;

public interface EdgeMapper {
    /**
     * Transforme un DTO d'import en entité Edge,
     * en résolvant les nœuds source et cible depuis l'index fourni.
     */
    Edge toEntity(EdgeImportDto dto, Map<String, Node> nodeIndex);
}
