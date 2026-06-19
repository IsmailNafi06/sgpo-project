package sgpo.mappers.impl;

import org.springframework.stereotype.Service;
import sgpo.dtos.EdgeImportDto;
import sgpo.entities.Edge;
import sgpo.entities.Node;
import sgpo.mappers.EdgeMapper;

import java.util.Map;

@Service
public class EdgeMapperImpl implements EdgeMapper {

    @Override
    public Edge toEntity(EdgeImportDto dto, Map<String, Node> nodeIndex) {
        Node source = nodeIndex.get(dto.getSource_id());
        Node target = nodeIndex.get(dto.getTarget_id());
        if (source == null || target == null) {
            throw new IllegalArgumentException(
                    "Nœud source ou cible introuvable pour l'edge " + dto.getId()
            );
        }

        Edge edge = new Edge();
        edge.setId(dto.getId());
        edge.setSource(source);
        edge.setTarget(target);
        edge.setTypeLien(dto.getType_lien());
        edge.setTauxReussite(dto.getTaux_reussite());
        edge.setCoutSupplementaire(dto.getCout_supplementaire());
        edge.setDureeSupplementaireMois(dto.getDuree_supplementaire_mois());
        edge.setPrerequisNotes(dto.getPrerequis_notes());
        edge.setMoyenneMinimale(dto.getMoyenne_minimale());
        edge.setTypeAcces(dto.getType_acces());
        return edge;
    }
}
