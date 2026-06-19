package sgpo.services.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import sgpo.dtos.MetierPublicDTO;
import sgpo.repositories.NodeRepository;
import sgpo.services.PublicService;

import java.util.List;

@Service
@RequiredArgsConstructor
public class PublicServiceImpl implements PublicService {

    private final NodeRepository nodeRepository;

    @Override
    public List<MetierPublicDTO> getMetiersActifs() {
        return nodeRepository.findActiveMetiers().stream()
                .map(node -> {
                    MetierPublicDTO dto = new MetierPublicDTO();
                    dto.setCode(node.getCode());
                    dto.setNomFr(node.getNomFr());
                    dto.setSecteur(node.getSecteur());
                    return dto;
                })
                .toList();
    }
}

