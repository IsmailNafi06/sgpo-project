package sgpo.mappers;

import sgpo.dtos.CheminDTO;
import sgpo.dtos.EtapeDTO;
import sgpo.entities.Edge;
import sgpo.entities.Node;

import java.util.List;

public interface ParcoursMapper {
    CheminDTO convertirEnDTO(List<Edge> edges, Node depart);

    EtapeDTO creerEtape(Node node, Edge edge);
}

